// /sw.js

self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Recibido.');
    
    const data = event.data ? event.data.json() : {};

    const title = data.title || 'BarberLink';
    const options = {
        body: data.body || 'Tienes una nueva notificación.',
        
        // El ícono pequeño (sin cambios)
        icon: data.icon || 'images/icons/icon-192x192.png',

        // ✅ AÑADIDO: Le decimos al navegador que use la imagen grande del payload
        image: data.image,
        
        badge: 'images/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.data.url,
            citaId: data.data.citaId
        },
        actions: [
            {
                action: 'show_reminder_modal',
                title: '📲 Enviar Recordatorio por WhatsApp',
            }
        ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

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
