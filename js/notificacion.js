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
          <div class="delete-action" data-id="${n.id}">
            <i class="fas fa-trash"></i>
          </div>
        </li>
      `;
    }).join('');

    // Agregar eventos de deslizar y borrar
    setupSwipeToDelete();
  });
}
    // --- Lógica Realtime ---
    // En /js/notificacion.js

function setupRealtimeListener() {
    if (!currentUserId) return;

    const channelName = `realtime:notifications:${currentUserId}`;

    // Si ya hay canal, lo cerramos antes de crear uno nuevo
    if (notificationChannel) {
        supabaseClient.removeChannel(notificationChannel);
    }

    const retryRealtime = () => {
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
                    console.log('[Realtime] Nueva notificación:', payload.new);
                    handleNewNotification(payload.new);
                }
            )
            .subscribe((status, error) => {
                console.log(`[Realtime] Estado: ${status}`);
                if (error) {
                    console.warn('[Realtime] Error:', error.message);
                    // Reintento después de 5 segundos
                    setTimeout(retryRealtime, 5000);
                }
            });
    };

    retryRealtime();
}
    
    async function handleNewNotification(newNotificationData) {
        // Evita duplicados: verifica si ya existe por ID
        if (allNotifications.some(n => n.id === newNotificationData.id)) {
            return; // Ya existe, no la agregues de nuevo
        }
        // Para obtener los datos completos de la cita, hacemos una consulta rápida
        const { data: fullNotification, error } = await supabaseClient
            .from('notificaciones')
            .select('*, cita:citas(*, barbero_servicios(*, servicios_maestro(*)))')
            .eq('id', newNotificationData.id)
            .single();

        const notification = error ? newNotificationData : fullNotification;

        allNotifications.unshift(notification); // Solo agrega una vez

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

        // =========== INICIO DE LA MEJORA PARA EL TOAST ===========
        let message = notification.mensaje || 'Nueva notificación';
        if (notification.cita && notification.cita.tipo_servicio) {
            const tipoServicioTexto = notification.cita.tipo_servicio === 'domicilio' ? ' (A Domicilio)' : '';
            message += tipoServicioTexto;
        }
        // ============ FIN DE LA MEJORA PARA EL TOAST ============

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
 * Configura el deslizamiento y borrado de notificaciones
 */
function setupSwipeToDelete() {
  const notificationItems = document.querySelectorAll('.notification-item');

  notificationItems.forEach(item => {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    item.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isSwiping = true;
    });

    item.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;

      if (diff < -50) {
        item.classList.add('swiped');
      } else {
        item.classList.remove('swiped');
      }
    });

    item.addEventListener('touchend', async () => {
      if (item.classList.contains('swiped')) {
        const notificationId = item.dataset.id;
        await deleteNotification(notificationId);
      }
    });
    
    function setupSwipeToDelete() {
  const items = document.querySelectorAll('.notification-item');
  
  items.forEach(item => {
    let startX = 0;
    let currentX = 0;

    // Touch events para móvil
    item.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    });

    item.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
      const diff = startX - currentX;
      
      if (diff > 50) {
        item.style.transform = `translateX(-${Math.min(diff, 80)}px)`;
      }
    });

    item.addEventListener('touchend', () => {
      const diff = startX - currentX;
      
      if (diff > 80) {
        const id = item.dataset.id;
        item.style.transition = 'transform 0.3s, opacity 0.3s';
        item.style.transform = 'translateX(-100%)';
        item.style.opacity = '0';
        
        setTimeout(() => {
          deleteNotification(id);
        }, 300);
      } else {
        item.style.transform = 'translateX(0)';
      }
    });

    // Mouse events para desktop
    let isMouseDown = false;
    
    item.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      startX = e.clientX;
    });

    item.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      currentX = e.clientX;
      const diff = startX - currentX;
      
      if (diff > 0) {
        item.style.transform = `translateX(-${Math.min(diff, 80)}px)`;
      }
    });

    item.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      
      const diff = startX - currentX;
      
      if (diff > 80) {
        const id = item.dataset.id;
        deleteNotification(id);
      } else {
        item.style.transform = 'translateX(0)';
      }
    });

    item.addEventListener('mouseleave', () => {
      item.style.transform = 'translateX(0)';
      isMouseDown = false;
    });
  });
}

    // Click en el botón de borrar
    const deleteBtn = item.querySelector('.delete-action');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const notificationId = e.target.closest('.delete-action').dataset.id;
        await deleteNotification(notificationId);
      });
    }
  });
}

/**
 * Borra permanentemente una notificación de la base de datos
 */
async function deleteNotification(notificationId) {
  if (!notificationId || !supabaseClient) return;

  const { error } = await supabaseClient
    .from('notificaciones')
    .delete()
    .eq('id', notificationId);

  if (error) {
    console.error('Error al borrar:', error);
    return;
  }

  // Actualizar la lista local y renderizar
  allNotifications = allNotifications.filter(n => n.id !== notificationId);
  renderNotifications();
  showToastNotification({
    mensaje: 'Notificación eliminada',
    tipo: 'default'
  });
}
