// /sw.js

self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Recibido.');
    
    const data = event.data ? event.data.json() : {};

    // ✅ --- INICIO DE LA MEJORA --- ✅
    // Obtenemos la imagen del cliente desde el payload.
    // Si no viene, usamos un ícono por defecto para asegurar que siempre haya una imagen.
    const imageIcon = data.clientImage || 'images/icons/icon-192x192.png';
    // ✅ --- FIN DE LA MEJORA --- ✅

    const title = data.title || 'Barber App';
    const options = {
        body: data.body || 'Tienes una nueva notificación.',
        
        // Aquí usamos la imagen del cliente (o la de por defecto)
        icon: imageIcon,
        
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
