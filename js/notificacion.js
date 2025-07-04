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
        
        // Verificar estado de autenticación al cargar
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            handleAuthStateChange(session);
        });

        // Escuchar cambios de autenticación
        supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log('Cambio en estado de autenticación:', event);
            handleAuthStateChange(session);
        });
    }

    // --- Manejo del Estado de Autenticación ---
    function handleAuthStateChange(session) {
        const newUserId = session?.user?.id || null;
        if (currentUserId !== newUserId) {
            console.log("Cambio en ID de usuario:", {
                anterior: currentUserId,
                nuevo: newUserId
            });
            
            // Limpiar estado anterior
            if (currentUserId && notificationChannel) {
                supabaseClient.removeChannel(notificationChannel);
                console.log("🔌 Canal de notificaciones cerrado para usuario anterior");
            }
            
            currentUserId = newUserId;
            allNotifications = [];
            renderNotifications();
            
            if (currentUserId) {
                console.log("👤 ID de usuario capturado:", currentUserId);
                loadInitialNotifications();
                setupRealtimeListener();
            } else {
                console.log("👤 Usuario cerró sesión. Limpiando notificaciones.");
            }
        }
    }

    // --- Lógica de Carga y Renderizado ---
    async function loadInitialNotifications() {
        if (!currentUserId) return;
        
        console.log("📥 Cargando notificaciones iniciales...");
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
        console.log(`✅ ${allNotifications.length} notificaciones cargadas`);
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
                
                return `
                    <li class="notification-item ${isUnread}">
                        <a href="#" class="notification-link" data-index="${index}">
                            <i class="${icon}"></i>
                            <div>
                                <p>${message}</p>
                                <small>${timeAgo}</small>
                            </div>
                        </a>
                    </li>
                `;
            }).join('');
        });
    }

    // --- LÓGICA REALTIME MEJORADA ---
   // EN: js/notificacion.js

function setupRealtimeListener() {
    if (!currentUserId) {
        console.error("⚠️ No se puede configurar realtime: currentUserId es nulo");
        return;
    }

    if (notificationChannel) {
        try {
            supabaseClient.removeChannel(notificationChannel);
            console.log("🔌 Canal anterior cerrado");
        } catch (e) {
            console.error("Error cerrando canal anterior:", e);
        }
    }

    // El nombre del canal puede ser más genérico ahora, pero mantenerlo único por usuario es buena práctica.
    const channelName = `realtime:notifications:${currentUserId}`;
    console.log(`🔔 Creando canal realtime para escuchar la tabla de notificaciones: ${channelName}`);

    notificationChannel = supabaseClient
        .channel(channelName)
        .on(
            'postgres_changes', // <-- ¡CAMBIO CLAVE! Escuchamos cambios de la base dedatos
            {
                event: 'INSERT', // <-- Nos interesa solo cuando se insertan nuevas notificaciones
                schema: 'public',
                table: 'notificaciones',
                filter: `barbero_id=eq.${currentUserId}` // <-- ¡MUY IMPORTANTE! Escuchar solo notificaciones para el barbero actual
            },
            (payload) => {
                // El payload.new contiene la fila completa de la nueva notificación
                console.log('🎉 Cambio en la base de datos recibido:', payload);
                handleNewNotification(payload.new);
            }
        )
        .subscribe((status, error) => {
            if (status === 'SUBSCRIBED') {
                isRealtimeActive = true;
                console.log(`✅ Suscrito exitosamente al canal ${channelName}`);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                isRealtimeActive = false;
                console.error(`❌ Error en canal realtime (${status}):`, error);
                // Reintentar conexión después de un tiempo
                setTimeout(setupRealtimeListener, 10000);
            }
        });
}
    
    function handleNewNotification(newNotification) {
        console.log("➕ Nueva notificación recibida:", newNotification);
        
        // Actualizar lista de notificaciones
        allNotifications.unshift(newNotification);
        
        // Actualizar UI
        renderNotifications();
        
        // Mostrar notificación toast
        showToastNotification(newNotification);
        
        // Notificar a otros módulos
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
            // Actualizar estado local
            allNotifications.forEach(n => {
                if (unreadIds.includes(n.id)) n.leido = true;
            });
            renderNotifications();
        }
    }

    function showToastNotification(notification) {
        try {
            const toast = document.createElement('div');
            toast.className = 'toast-notification';
            const icon = getIconForType(notification.tipo);
            toast.innerHTML = `<i class="${icon}"></i> <p>${notification.mensaje}</p>`;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.add('show');
                
                // Sonido de notificación
                try {
                    const audio = new Audio('https://cdn.freesound.org/previews/219/219244_3243391-lq.mp3');
                    audio.volume = 0.4;
                    audio.play().catch(e => console.log("🔇 No se pudo reproducir sonido:", e));
                } catch (audioError) {
                    console.log("🔇 Error con audio de notificación:", audioError);
                }
            }, 100);
            
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 500);
            }, 5000);
        } catch (e) {
            console.error("❌ Error mostrando toast:", e);
        }
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
            { label: 'año', seconds: 31536000 },
            { label: 'mes', seconds: 2592000 },
            { label: 'día', seconds: 86400 },
            { label: 'hora', seconds: 3600 },
            { label: 'minuto', seconds: 60 },
            { label: 'segundo', seconds: 1 }
        ];
        
        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count >= 1) {
                return `hace ${count} ${interval.label}${count !== 1 ? 's' : ''}`;
            }
        }
        return "justo ahora";
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

                // Manejar diferentes tipos de notificaciones
                if (notification.tipo === 'confirmacion_asistencia' && notification.cita) {
                    document.dispatchEvent(new CustomEvent('showConfirmationModal', { 
                        detail: { cita: notification.cita } 
                    }));
                } else if (notification.cita && notification.cita.fecha_cita) {
                  // Cambiamos el nombre del evento para que coincida con el listener en barberProfile.js
                    document.dispatchEvent(new CustomEvent('navigateToDate', { 
        detail: { 
            dateString: notification.cita.fecha_cita,
            citaId: notification.cita.id // <-- ID de la cita añadido
        } 
    }));
                }

                document.querySelectorAll('.notification-panel.show').forEach(panel => panel.classList.remove('show'));
            }
        });
    }

    // --- Iniciar el Módulo ---
    initNotifications();
    
    // Verificar estado de realtime cada minuto
    setInterval(() => {
        if (currentUserId && !isRealtimeActive) {
            console.log("⚠️ Realtime inactivo. Reconectando...");
            setupRealtimeListener();
        }
    }, 60000);
});
