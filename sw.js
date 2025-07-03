// /sw.js (NUEVO ARCHIVO)

self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Recibido.');
    
    // El payload (los datos) viene como texto, necesitamos convertirlo a un objeto JSON.
    const data = event.data ? event.data.json() : {};

    const title = data.title || 'Barber App';
    const options = {
        body: data.body || 'Tienes una nueva notificación.',
        icon: 'images/icons/icon-192x192.png', // DEBES CREAR ESTA IMAGEN
        badge: 'images/icons/badge-72x72.png',  // Y ESTA TAMBIÉN
        vibrate: [200, 100, 200], // Patrón de vibración
        sound: 'sounds/notification.mp3', // SONIDO PERSONALIZADO (OPCIONAL)
        data: {
            url: data.url || '/' // URL a la que se irá al hacer clic
        }
    };

    // Muestra la notificación
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Clic en notificación recibido.');

    event.notification.close(); // Cierra la notificación

    // Abre la URL asociada a la notificación en una nueva ventana/pestaña
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
