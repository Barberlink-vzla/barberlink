// js/notificacion.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Variables de Estado ---
    let currentUserId = null;
    let notificationChannel = null;
    let allNotifications = [];
    let reconnectionTimer = null; // Para controlar los intentos de reconexión

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
        
        // Escucha cambios en la sesión de autenticación
        supabaseClient.auth.onAuthStateChange((event, session) => {
            handleAuthStateChange(session);
        });

        // Manejar el estado inicial de la sesión
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            handleAuthStateChange(session);
        });
    }

    // --- Manejo del Estado de Autenticación ---
    function handleAuthStateChange(session) {
        const newUserId = session?.user?.id || null;
        if (currentUserId !== newUserId) {
            currentUserId = newUserId;
            if (currentUserId) {
                console.log("👤 ID de usuario capturado:", currentUserId);
                loadInitialNotifications();
                setupRealtimeConnection(); // Usamos la nueva función robusta
            } else {
                // Si el usuario cierra sesión, nos aseguramos de limpiar todo
                console.log("👤 Usuario cerró sesión. Limpiando notificaciones.");
                clearRealtimeConnection();
                allNotifications = [];
                renderNotifications();
            }
        }
    }

    // --- Lógica de Carga y Renderizado ---
    async function loadInitialNotifications() {
        if (!currentUserId) return;
        const { data, error } = await supabaseClient
            .from('notificaciones')
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
                const message = n.mensaje || 'Notificación sin mensaje.';
                return `<li class="notification-item ${isUnread}"><a href="#" class="notification-link" data-index="${index}"><i class="${icon}"></i><div><p>${message}</p><small>${timeAgo}</small></div></a></li>`;
            }).join('');
        });
    }

    // --- LÓGICA DE TIEMPO REAL (MEJORADA) ---

    /**
     * Limpia la conexión de tiempo real existente de forma segura.
     */
    function clearRealtimeConnection() {
        if (reconnectionTimer) {
            clearTimeout(reconnectionTimer);
            reconnectionTimer = null;
        }
        if (notificationChannel) {
            supabaseClient.removeChannel(notificationChannel)
                .then(() => console.log("🔌 Canal de notificaciones anterior removido."))
                .catch(error => console.error("Error al remover canal:", error));
            notificationChannel = null;
        }
    }

    /**
     * Configura y suscribe al canal de notificaciones de forma robusta.
     */
    function setupRealtimeConnection() {
        clearRealtimeConnection(); // Limpiamos cualquier conexión anterior

        if (!currentUserId) return;

        const channelName = `notifications-for-${currentUserId}`;
        console.log(`📡 Sintonizando nuevo canal: ${channelName}`);

        notificationChannel = supabaseClient.channel(channelName, {
            config: {
                broadcast: { self: false }, // No necesitamos recibir nuestros propios broadcasts
            },
        });

        // Listener para notificaciones de nuevas reservas
        notificationChannel.on('broadcast', { event: 'new_booking' }, ({ payload }) => {
            console.log("🎉 ¡Broadcast de nueva reserva recibido!", payload);
            showToastNotification({
                tipo: 'nueva_reserva',
                mensaje: '¡Acabas de recibir una nueva reserva!'
            });
            // Recargamos todo para mantener la consistencia
            setTimeout(() => {
                loadInitialNotifications();
                document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
            }, 1500);
        });
        
        // Suscripción al canal con manejo de estados
        notificationChannel.subscribe((status, err) => {
            console.log(`🚦 Estado del canal: ${status}`);

            if (status === 'SUBSCRIBED') {
                console.log('✅ ¡Suscripción a Broadcast exitosa!');
                // Si había un timer de reconexión, lo limpiamos porque ya estamos conectados.
                if (reconnectionTimer) {
                    clearTimeout(reconnectionTimer);
                    reconnectionTimer = null;
                }
            }
            
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || (err && err.message.includes('expired'))) {
                console.error(`❌ Error en el canal: ${status}.`, err || '');
                // No reintentamos inmediatamente para evitar bucles.
                // Supabase intentará reconectar automáticamente. Si falla permanentemente,
                // un refresco de página es la solución más segura.
            }
        });
    }
    
    // --- Funciones de Utilidad ---

    async function markNotificationsAsRead() {
        const unreadIds = allNotifications.filter(n => !n.leido).map(n => n.id);
        if (unreadIds.length === 0) return;
        const { error } = await supabaseClient.from('notificaciones').update({ leido: true }).in('id', unreadIds);
        if (error) {
            console.error("❌ Error al marcar notificaciones como leídas:", error);
        } else {
            allNotifications.forEach(n => { if (unreadIds.includes(n.id)) n.leido = true; });
            setTimeout(renderNotifications, 1000);
        }
    }

    function showToastNotification(notification) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        const icon = getIconForType(notification.tipo);
        toast.innerHTML = `<i class="${icon}"></i> <p>${notification.mensaje}</p>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('show');
            const audio = new Audio('https://cdn.freesound.org/previews/219/219244_3243391-lq.mp3');
            audio.volume = 0.4;
            audio.play().catch(e => console.log("No se pudo reproducir sonido de toast.", e));
        }, 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }

    function getIconForType(type) {
        switch (type) {
            case 'nueva_reserva': return 'fas fa-calendar-plus';
            case 'reprogramacion': return 'fas fa-calendar-alt';
            case 'cancelacion': return 'fas fa-calendar-times';
            case 'confirmacion_asistencia': return 'fas fa-question-circle';
            case 'recordatorio_pago': return 'fas fa-file-invoice-dollar';
            default: return 'fas fa-bell';
        }
    }

    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 5) return "justo ahora";
        let interval = seconds / 31536000;
        if (interval > 1) return `hace ${Math.floor(interval)} años`;
        interval = seconds / 2592000;
        if (interval > 1) return `hace ${Math.floor(interval)} meses`;
        interval = seconds / 86400;
        if (interval > 1) return `hace ${Math.floor(interval)} días`;
        interval = seconds / 3600;
        if (interval > 1) return `hace ${Math.floor(interval)} horas`;
        interval = seconds / 60;
        if (interval > 1) return `hace ${Math.floor(interval)} min`;
        return `hace ${Math.floor(seconds)} seg`;
    }

    function setupEventListeners() {
        document.body.addEventListener('click', (e) => {
            const bellContainer = e.target.closest('.notification-bell-container');
            const clickedPanel = e.target.closest('.notification-panel');

            if (bellContainer && !clickedPanel) {
                const panel = bellContainer.querySelector('.notification-panel');
                const isVisible = panel.classList.toggle('show');
                if (isVisible) {
                    markNotificationsAsRead();
                }
            } else if (!clickedPanel) {
                document.querySelectorAll('.notification-panel.show').forEach(panel => panel.classList.remove('show'));
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
                    document.dispatchEvent(new CustomEvent('navigateToDate', { detail: { dateString: notification.cita.fecha_cita } }));
                }
                document.querySelectorAll('.notification-panel.show').forEach(panel => panel.classList.remove('show'));
            }
        });
    }

    // --- Iniciar el Módulo ---
    initNotifications();
});
