// /sw.js

self.addEventListener('push', function(event) {
    // Esta línea es para depuración: te permitirá ver en la consola del navegador exactamente lo que llega.
    console.log('[Service Worker] Push Recibido.');

    // Se recomienda verificar si `event.data` existe antes de llamar a `.json()`
    if (!event.data) {
        console.log('[Service Worker] Push sin datos.');
        return;
    }

    const data = event.data.json();
    console.log('[Service Worker] Datos del Push:', data); // <-- ¡Línea de depuración clave!

    const title = data.title || 'BarberLink';
    const options = {
        body: data.body || 'Tienes una nueva notificación.',
        
        // Esta propiedad usa la URL del avatar para el ÍCONO PEQUEÑO.
        // Si falla, usa un ícono local por defecto.
        icon: data.icon || 'images/icons/icon-192x192.png',

        // ✅ ESTA ES LA PROPIEDAD CRÍTICA.
        // Usa la misma URL del avatar para la IMAGEN GRANDE Y DESTACADA.
        image: data.image,
        
        // Resto de las opciones...
        badge: 'images/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.data.url,
            citaId: data.data.citaId
        },
        // Las acciones personalizadas son una excelente mejora. ¡Bien hecho aquí!
        actions: [
            {
                action: 'show_reminder_modal',
                title: '📲 Enviar Recordatorio por WhatsApp',
            }
        ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});


// Tu código para manejar el clic en la notificación es correcto. No necesita cambios.
self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Clic en notificación recibido.');

    event.notification.close();

    const urlToOpen = event.notification.data.url;

    if (urlToOpen) {
        event.waitUntil(
            clients.openWindow(urlToOpen)
        );
    }
});
