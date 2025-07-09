// supabase/functions/create-booking/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Definimos los tipos para mayor claridad y seguridad
interface BookingPayload {
  barberId: string;
  clientName: string;
  clientPhone: string;
  serviceId: number;
  bookingDate: string; // YYYY-MM-DD
  startTime: string;   // HH:MM:SS
  endTime: string;     // HH:MM:SS
  finalPrice: number;
  serviceType: 'domicilio' | 'studio'; // 'domicilio' o 'studio'
}

serve(async (req) => {
  // 1. Validar que la petición sea POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. Extraer el payload de la reserva del cuerpo de la petición
    const payload: BookingPayload = await req.json();

    // 3. Crear un cliente de Supabase con privilegios de 'service_role' para saltar RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 4. Lógica de reserva:
    // 4.1. Crear o encontrar al cliente (Upsert)
    const nameParts = payload.clientName.split(' ');
    const nombre = nameParts.shift() || '';
    const apellido = nameParts.join(' ');

    const { data: client, error: clientError } = await supabaseAdmin
      .from('clientes')
      .upsert(
        {
          barbero_id: payload.barberId,
          nombre: nombre,
          apellido: apellido,
          telefono: payload.clientPhone,
        },
        { onConflict: 'barbero_id, telefono' }
      )
      .select()
      .single();

    if (clientError) throw new Error(`Error al procesar cliente: ${clientError.message}`);

    // 4.2. Crear la cita (Cita)
    const newCita = {
      barbero_id: payload.barberId,
      cliente_id: client.id,
      cliente_nombre: payload.clientName,
      cliente_telefono: payload.clientPhone,
      servicio_reservado_id: payload.serviceId,
      fecha_cita: payload.bookingDate,
      hora_inicio_cita: payload.startTime,
      hora_fin_cita: payload.endTime,
      estado: 'confirmada', // O 'pendiente', según tu lógica
      estado_pago: 'pendiente',
      precio_final: payload.finalPrice,
      tipo_servicio: payload.serviceType, // Guardamos el tipo de servicio
    };

    const { data: insertedCita, error: citaError } = await supabaseAdmin
      .from('citas')
      .insert(newCita)
      .select()
      .single();

    if (citaError) throw new Error(`Error al crear la cita: ${citaError.message}`);
    
    // 4.3. (Opcional) Crear la notificación para el barbero
    const notificationMessage = `${payload.clientName} ha reservado una cita.`;
    await supabaseAdmin.from('notificaciones').insert({
        barbero_id: payload.barberId,
        mensaje: notificationMessage,
        tipo: 'nueva_reserva',
        leido: false,
        cita_id: insertedCita.id
    });


    // 5. Devolver una respuesta exitosa con los datos de la cita creada
    return new Response(JSON.stringify({ bookingData: insertedCita }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    // 6. Manejar errores y devolver una respuesta clara
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
