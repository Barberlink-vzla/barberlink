// supabase/functions/create-booking/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- INICIO DE LA CORRECCIÓN: HEADERS DE CORS ---
// Define las cabeceras que permitirán la comunicación desde tu web.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Permite cualquier origen. Para mayor seguridad, reemplaza '*' con 'https://barberlink-vzla.github.io'
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
// --- FIN DE LA CORRECCIÓN ---

// Definimos los tipos para mayor claridad y seguridad
interface BookingPayload {
  barberId: string;
  clientName: string;
  clientPhone: string;
  serviceId: number;
  bookingDate: string; 
  startTime: string;   
  endTime: string;     
  finalPrice: number;
  serviceType: 'domicilio' | 'studio'; 
}

serve(async (req) => {
  // --- INICIO DE LA CORRECCIÓN: MANEJO DE SOLICITUDES 'PREFLIGHT' ---
  // El navegador envía una solicitud 'OPTIONS' antes del 'POST' para verificar los permisos.
  // Debemos responder a ella afirmativamente.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  // --- FIN DE LA CORRECCIÓN ---

  try {
    const payload: BookingPayload = await req.json();

    // Crear un cliente de Supabase con privilegios de 'service_role' para saltar RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Insertar la nueva cita en la base de datos
    const { data: insertedCita, error: citaError } = await supabaseAdmin
      .from('citas')
      .insert({
        barbero_id: payload.barberId,
        cliente_nombre: payload.clientName,
        cliente_telefono: payload.clientPhone,
        servicio_reservado_id: payload.serviceId,
        fecha_cita: payload.bookingDate,
        hora_inicio_cita: payload.startTime,
        hora_fin_cita: payload.endTime,
        estado: 'confirmada',
        estado_pago: 'pendiente',
        precio_final: payload.finalPrice,
        tipo_servicio: payload.serviceType,
      })
      .select()
      .single();

    if (citaError) throw new Error(`Error al crear la cita: ${citaError.message}`);

    // Crear la notificación para el barbero
    const notificationMessage = `${payload.clientName} ha reservado una cita.`;
    await supabaseAdmin.from('notificaciones').insert({
        barbero_id: payload.barberId,
        mensaje: notificationMessage,
        tipo: 'nueva_reserva',
        leido: false,
        cita_id: insertedCita.id
    });

    // --- INICIO DE LA CORRECCIÓN: AÑADIR HEADERS A LA RESPUESTA ---
    return new Response(JSON.stringify({ bookingData: insertedCita }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
    // --- FIN DE LA CORRECCIÓN ---

  } catch (err) {
    // --- INICIO DE LA CORRECCIÓN: AÑADIR HEADERS A LA RESPUESTA DE ERROR ---
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400,
    });
    // --- FIN DE LA CORRECCIÓN ---
  }
})
