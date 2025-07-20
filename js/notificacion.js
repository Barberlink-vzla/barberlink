// js/notificacion.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Variables de Estado ---
    let currentUserId = null;
    let notificationChannel = null;
    let allNotifications = [];
    let isRealtimeActive = false;

    // --- Elementos del DOM ---
    const bellContainers = document.querySelectorAll('.notification-bell-container');
    const notificationCounts = document.querySelectorAll('.notification-count');
    const notificationLists = document.querySelectorAll('.notification-list');

    // --- Inicialización del Módulo ---
    function initNotifications() {
        if (typeof supabaseClient === 'undefined') {
            console.error("❌ Notifications Error: supabaseClient no está definido.");
            return;
        }
        console.log("✅ Módulo de notificaciones iniciado correctamente.");
        
        setupEventListeners();
        
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            handleAuthStateChange(session);
        });

        supabaseClient.auth.onAuthStateChange((event, session) => {
            handleAuthStateChange(session);
        });
    }

    // --- Manejo del Estado de Autenticación ---
    function handleAuthStateChange(session) {
        const newUserId = session?.user?.id || null;
        if (currentUserId !== newUserId) {
            // Quita canal anterior si existía
            if (notificationChannel) {
                supabaseClient.removeChannel(notificationChannel);
                notificationChannel = null;
            }
            currentUserId = newUserId;
            allNotifications = [];
            renderNotifications();
            if (currentUserId) {
                loadInitialNotifications();
                setupRealtimeListener();
            }
        }
    }

    // --- Lógica de Carga y Renderizado ---
    async function loadInitialNotifications() {
        if (!currentUserId) return;
        
        const { data, error } = await supabaseClient
            .from('notificaciones')
            // Se solicita la cita completa para acceder a todos sus campos
            .select('*, cita:citas(*, barbero_servicios(*, servicios_maestro(*)))')
            .eq('barbero_id', currentUserId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error("❌ Error al cargar notificaciones iniciales:", error);
            return;
        }
        
        allNotifications = data || [];
        renderNotifications();
    }

  function renderNotifications() {
      const unreadCount = allNotifications.filter(n => !n.leido).length;
      notificationCounts.forEach(el => {
        el.textContent = unreadCount;
        el.style.display = unreadCount > 0 ? 'flex' : 'none';
      });

      notificationLists.forEach(list => {
        if (allNotifications.length === 0) {
          list.innerHTML = '<li class="notification-item no-notifications">No tienes notificaciones.</li>';
          return;
        }

        list.innerHTML = allNotifications.map((n, index) => {
          const timeAgo = getTimeAgo(new Date(n.created_at));
          const isUnread = !n.leido ? 'unread' : '';
          const icon = getIconForType(n.tipo);

          let message = n.mensaje || 'Notificación sin mensaje.';
          if (n.cita && n.cita.tipo_servicio) {
            const tipoServicioTexto = n.cita.tipo_servicio === 'domicilio' ? ' (A Domicilio)' : ' (En Estudio)';
            message += tipoServicioTexto;
          }

          // **MEJORA**: Se elimina el botón de basura (.delete-action) que ya no es necesario.
          return `
            <li class="notification-item ${isUnread}" data-id="${n.id}">
              <div class="notification-content">
                <a href="#" class="notification-link" data-index="${index}">
                  <i class="${icon}"></i>
                  <div>
                    <p>${message}</p>
                    <small>${timeAgo}</small>
                  </div>
                </a>
              </div>
            </li>
          `;
        }).join('');

        // **MODIFICADO**: Se llama a la nueva función de deslizamiento.
        setupSwipeToDelete();
      });
    }

    // --- Lógica Realtime ---
    function setupRealtimeListener() {
        if (!currentUserId) return;

        const channelName = `realtime:notifications:${currentUserId}`;
        if (notificationChannel) {
            supabaseClient.removeChannel(notificationChannel);
        }
        
        console.log(`[Realtime] Intentando suscribirse al canal: ${channelName}`);

        notificationChannel = supabaseClient
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notificaciones',
                    filter: `barbero_id=eq.${currentUserId}`
                },
                (payload) => {
                    console.log('[Realtime] ¡Nueva notificación recibida! 🎉', payload.new);
                    handleNewNotification(payload.new);
                }
            )
            .subscribe((status, error) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] ¡Conexión exitosa al canal! ✅');
                }
                if (status === 'CHANNEL_ERROR') {
                    console.error('[Realtime] Error de canal. La causa más común es que el proyecto de Supabase está pausado. Revisa tu dashboard.', error);
                }
                if (status === 'TIMED_OUT') {
                     console.warn('[Realtime] La conexión expiró (Timed Out). Reintentando...');
                }
            });
    }
    
    async function handleNewNotification(newNotificationData) {
        if (allNotifications.some(n => n.id === newNotificationData.id)) {
            return;
        }
        const { data: fullNotification, error } = await supabaseClient
            .from('notificaciones')
            .select('*, cita:citas(*, barbero_servicios(*, servicios_maestro(*)))')
            .eq('id', newNotificationData.id)
            .single();

        const notification = error ? newNotificationData : fullNotification;
        allNotifications.unshift(notification);
        renderNotifications();
        showToastNotification(notification);
        document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
    }

    // --- Funciones de Utilidad ---
    async function markNotificationsAsRead() {
        const unreadIds = allNotifications.filter(n => !n.leido).map(n => n.id);
        if (unreadIds.length === 0) return;
        
        const { error } = await supabaseClient.from('notificaciones').update({ leido: true }).in('id', unreadIds);
        if (error) {
            console.error("❌ Error al marcar notificaciones como leídas:", error);
        } else {
            allNotifications.forEach(n => {
                if (unreadIds.includes(n.id)) n.leido = true;
            });
            renderNotifications();
        }
    }

    function showToastNotification(notification) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        const icon = getIconForType(notification.tipo);
        let message = notification.mensaje || 'Nueva notificación';
        if (notification.cita && notification.cita.tipo_servicio) {
            const tipoServicioTexto = notification.cita.tipo_servicio === 'domicilio' ? ' (A Domicilio)' : '';
            message += tipoServicioTexto;
        }
        toast.innerHTML = `<i class="${icon}"></i> <p>${message}</p>`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
            try {
                const audio = new Audio('https://cdn.freesound.org/previews/219/219244_3243391-lq.mp3');
                audio.volume = 0.4;
                audio.play().catch(e => {});
            } catch (audioError) {}
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }

    function getIconForType(type) {
        const icons = {
            'nueva_reserva': 'fas fa-calendar-plus',
            'reprogramacion': 'fas fa-calendar-alt',
            'cancelacion': 'fas fa-calendar-times',
            'confirmacion_asistencia': 'fas fa-question-circle',
            'recordatorio_pago': 'fas fa-file-invoice-dollar',
            'default': 'fas fa-bell'
        };
        return icons[type] || icons.default;
    }

    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        const intervals = [
            { label: 'año', seconds: 31536000 }, { label: 'mes', seconds: 2592000 },
            { label: 'día', seconds: 86400 }, { label: 'hora', seconds: 3600 },
            { label: 'minuto', seconds: 60 }, { label: 'segundo', seconds: 1 }
        ];
        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count >= 1) return `hace ${count} ${interval.label}${count !== 1 ? 's' : ''}`;
        }
        return "justo ahora";
    }

    function setupEventListeners() {
        document.body.addEventListener('click', (e) => {
            const bellContainer = e.target.closest('.notification-bell-container');
            const clickedPanel = e.target.closest('.notification-panel');

            if (bellContainer && !clickedPanel) {
                const panel = bellContainer.querySelector('.notification-panel');
                if (panel.classList.toggle('show')) {
                    markNotificationsAsRead();
                }
            } else if (!clickedPanel) {
                document.querySelectorAll('.notification-panel.show').forEach(p => p.classList.remove('show'));
            }

            const link = e.target.closest('.notification-link');
            if (link) {
                e.preventDefault();
                const notifIndex = parseInt(link.dataset.index, 10);
                const notification = allNotifications[notifIndex];
                if (!notification) return;

                if (notification.tipo === 'confirmacion_asistencia' && notification.cita) {
                    document.dispatchEvent(new CustomEvent('showConfirmationModal', { detail: { cita: notification.cita } }));
                } else if (notification.cita && notification.cita.fecha_cita) {
                    document.dispatchEvent(new CustomEvent('navigateToDate', { 
                        detail: { 
                            dateString: notification.cita.fecha_cita,
                            citaId: notification.cita.id
                        } 
                    }));
                }
                document.querySelectorAll('.notification-panel.show').forEach(p => p.classList.remove('show'));
            }
        });
    }
    
    // --- Iniciar ---
    initNotifications();
});

/**
 * **FUNCIÓN ACTUALIZADA Y MEJORADA**
 * Configura la lógica de deslizamiento para eliminar notificaciones.
 */
function setupSwipeToDelete() {
    const notificationItems = document.querySelectorAll('.notification-list .notification-item');

    notificationItems.forEach(item => {
        // Previene que se añadan múltiples listeners al mismo elemento
        if (item.dataset.swipeInitialized) return;
        item.dataset.swipeInitialized = 'true';

        let startX = 0;
        let deltaX = 0;
        let isSwiping = false;

        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = true;
            // Quita la transición durante el deslizamiento para un control directo
            item.style.transition = 'none';
        }, { passive: true });

        item.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            deltaX = e.touches[0].clientX - startX;

            // Solo actúa si el deslizamiento es hacia la derecha (positivo)
            if (deltaX > 0) {
                item.style.transform = `translateX(${deltaX}px)`;
            }
        }, { passive: true });

        item.addEventListener('touchend', () => {
            if (!isSwiping) return;
            isSwiping = false;
            
            // Umbral: El deslizamiento debe ser mayor al 40% del ancho del elemento
            const swipeThreshold = item.offsetWidth * 0.4;

            // Vuelve a aplicar la transición para una animación fluida
            item.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';

            if (deltaX > swipeThreshold) {
                // Éxito: El deslizamiento superó el umbral, se inicia la animación de borrado
                item.classList.add('item-is-deleting');

                // Escucha el final de la animación para borrar el elemento
                item.addEventListener('transitionend', () => {
                    const notificationId = item.dataset.id;
                    if (notificationId) {
                        deleteNotification(notificationId);
                    }
                }, { once: true }); // El listener se elimina solo después de ejecutarse
            } else {
                // Fallo: El deslizamiento fue muy corto, la notificación vuelve a su lugar
                item.style.transform = 'translateX(0)';
            }
            
            deltaX = 0; // Resetea la variable
        });
    });
}


/**
 * Borra permanentemente una notificación de la base de datos y actualiza la UI.
 */
// js/notificacion.js

/**
 * Borra permanentemente una notificación de la base de datos y actualiza la UI.
 * Esta función es llamada por el evento 'transitionend' después de la animación de borrado.
 */
async function deleteNotification(notificationId) {
  if (!notificationId || typeof supabaseClient === 'undefined') return;

  // 1. Actualiza el array de estado local eliminando la notificación.
  allNotifications = allNotifications.filter(n => String(n.id) !== String(notificationId));
  
  // 2. Vuelve a renderizar la lista para actualizar los contadores y
  //    mostrar el mensaje "No hay notificaciones" si es necesario.
  //    La notificación borrada ya no será visible porque no está en el array.
  renderNotifications(); 

  // 3. Finalmente, elimina el registro de la base de datos en segundo plano.
  const { error } = await supabaseClient
    .from('notificaciones')
    .delete()
    .eq('id', notificationId);

  if (error) {
    console.error('Error al borrar la notificación en la base de datos:', error);
    // En caso de error, podrías tener una lógica para recargar las notificaciones
    // desde la base de datos para asegurar la consistencia.
  }
}
