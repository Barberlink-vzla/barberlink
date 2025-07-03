// /supabase/functions/notify_on_event/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// SOLUCIÓN DEFINITIVA: Se importa desde esm.sh, una fuente más estable
// y se adapta el código para usar la librería 'web-push' de NPM.
import webpush from 'https://esm.sh/web-push@3.6.7';

// --- ¡IMPORTANTE! ---
// Asegúrate de que estas variables estén configuradas como "Secrets" en el panel de Supabase.
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!;

// Configura los detalles VAPID para la librería web-push
// El 'mailto:' es un requerimiento estándar. Puedes usar un email de contacto real.
webpush.setVapidDetails(
  'mailto:example@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { record: cita } = await req.json();

    if (!cita || !cita.barbero_id) {
      return new Response(JSON.stringify({ message: "Datos de cita incompletos o sin barbero_id" }), { status: 400 });
    }

    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription_info')
      .eq('user_id', cita.barbero_id);

    if (error) {
      console.error('Error buscando suscripción:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
        return new Response(JSON.stringify({ message: "El barbero no tiene notificaciones activas" }), { status: 200 });
    }

    const payload = JSON.stringify({
      title: '¡Nueva Reserva!',
      body: `Cliente: ${cita.cliente_nombre}. Servicio reservado.`,
      url: `/barber_profile.html`
    });

    // Envía la notificación a cada suscripción del barbero
    const promises = subscriptions.map(sub =>
      webpush.sendNotification(sub.subscription_info, payload)
        .catch(err => console.error(`Fallo al enviar a ${sub.subscription_info.endpoint}:`, err))
    );

    await Promise.all(promises);

    return new Response(JSON.stringify({ message: 'Notificaciones enviadas' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
