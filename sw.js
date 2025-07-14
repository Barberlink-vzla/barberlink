// /sw.js

self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Recibido.'); //
    
    const data = event.data ? event.data.json() : {}; //

    const title = data.title || 'Barber App';
    const options = {
        body: data.body || 'Tienes una nueva notificación.',
        icon: 'images/icons/icon-192x192.png', //
        badge: 'images/icons/badge-72x72.png', //
        vibrate: [200, 100, 200], //
        data: {
            url: data.data.url, // La URL con la acción
            citaId: data.data.citaId
        },
        // --- INICIO DE LA MEJORA ---
        // Esto añade botones a la notificación
        actions: [
            {
                action: 'show_reminder_modal', // Un identificador para la acción
                title: '📲 Enviar Recordatorio por WhatsApp',
            }
        ]
        // --- FIN DE LA MEJORA ---
    };

    event.waitUntil(self.registration.showNotification(title, options)); //
});

self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Clic en notificación recibido.'); //

    event.notification.close(); //

    // Comprueba si se hizo clic en el cuerpo de la notificación o en el botón de acción.
    // En ambos casos, queremos abrir la misma URL que ya contiene la acción correcta.
    const urlToOpen = event.notification.data.url;

    if (urlToOpen) {
        event.waitUntil(
            clients.openWindow(urlToOpen) //
        );
    }
});
