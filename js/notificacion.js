// js/notificacion.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Variables de Estado ---
    let currentUserId = null;
    let notificationChannel = null; // Guardará la referencia al canal de Realtime
    let allNotifications = [];

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
        
        supabaseClient.auth.onAuthStateChange((event, session) => {
            handleAuthStateChange(session);
        });

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
                // ===== MODIFICACIÓN: Nos suscribimos al canal de Broadcast =====
                setupBroadcastListener();
            } else {
                console.log("👤 Usuario cerró sesión. Limpiando notificaciones.");
                allNotifications = [];
                renderNotifications();
                // ===== MODIFICACIÓN: Nos desuscribimos del canal =====
                clearBroadcastListener();
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

    // ======================================================================
    // ===== INICIO DE LA NUEVA LÓGICA DE BROADCAST (REEMPLAZA A POLLING) =====
    // ======================================================================
    
    /**
     * Se desuscribe de cualquier canal activo.
     */
    function clearBroadcastListener() {
        if (notificationChannel) {
            supabaseClient.removeChannel(notificationChannel);
            notificationChannel = null;
            console.log("🔌 Desuscrito del canal de notificaciones.");
        }
    }

    /**
     * Se suscribe al canal de Broadcast para recibir notificaciones en tiempo real.
     */
    function setupBroadcastListener() {
        clearBroadcastListener(); // Asegurarnos de limpiar cualquier suscripción anterior
        if (!currentUserId) return;

        const channelName = `notifications-channel-for-${currentUserId}`;
        notificationChannel = supabaseClient.channel(channelName);

        notificationChannel
            .on(
                'broadcast',
                { event: 'new-notification' }, // Escuchamos el evento específico que enviamos
                (message) => {
                    console.log('🎉 ¡Broadcast recibido!', message);
                    
                    // El `message.payload` contiene el objeto que enviamos desde reserva.js
                    const newNotification = message.payload.payload;
                    
                    // Añadimos la nueva notificación al inicio del array
                    allNotifications.unshift(newNotification);
                    
                    // Actualizamos toda la UI
                    renderNotifications();
                    showToastNotification(newNotification);
                    
                    // Notificamos a otros módulos para que refresquen sus datos (como los reportes)
                    document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`✅ Suscrito exitosamente al canal de broadcast: ${channelName}`);
                }
            });
    }

    // ====================================================================
    // ===== FIN DE LA NUEVA LÓGICA DE BROADCAST =====
    // ====================================================================

    // --- Funciones de Utilidad (sin cambios) ---

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
