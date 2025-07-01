// js/barberProfile.js

// MEJORA: Centralizamos los estados de las citas para evitar errores de escritura.
const APPOINTMENT_STATUS = {
    PENDING: 'pendiente',
    CONFIRMED: 'confirmada',
    COMPLETED: 'completada',
    IN_PROGRESS: 'en proceso',
    NO_SHOW: 'no_asistio' // Estado para inasistencias
};

// La variable global `supabaseClient` es inicializada por `js/supabaseClient.js`

let currentUserId = null;
let masterServices = [];
let barberServicesData = []; // NUEVA VARIABLE GLOBAL PARA GUARDAR SERVICIOS
let barberClients = []
let currentPeriodAppointments = []; // Holds the full, unfiltered list of appointments for the current report period


// Variables globales para el calendario y la disponibilidad
let currentCalendarDate = new Date();
let weeklyAvailabilityData = [[], [], [], [], [], [], []];
let activeEditingDayIndex = -1;
let monthlyBookingsMap = new Map();

// Variables para recordatorios y confirmaciones
let appointmentCheckInterval = null; 
const notifiedAppointmentIds = new Set();
let confirmationCheckInterval = null; 
const promptedConfirmationIds = new Set(); 

const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const monthsOfYear = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// --- Elementos del DOM ---
const profileContent = document.getElementById('profile-content');
const servicesSection = document.getElementById('services-section');
const bookingLinkContainer = document.getElementById('booking-link-container');
const logoutProfileButton = document.getElementById('logout-profile-button');
const saveAllButton = document.getElementById('save-all-profile-btn');
const saveStatus = document.getElementById('save-status');
const addOtherServiceButton = document.getElementById('add-other-service-btn');
const calendarDaysGrid = document.getElementById('calendar-days-grid');
const calCurrentMonthYear = document.getElementById('cal-current-month-year');
const calPrevMonthBtn = document.getElementById('cal-prev-month-btn');
const calNextMonthBtn = document.getElementById('cal-next-month-btn');
const availabilityDayEditor = document.getElementById('availability-day-editor');
const editingDayTitleSpan = document.querySelector('#editing-day-title span');
const selectedDaySlotsContainer = document.getElementById('selected-day-slots-container');
const addSlotToSelectedDayBtn = document.getElementById('add-slot-to-selected-day-btn');
const selectedDayHeading = document.getElementById('selected-day-heading');
const bookingsList = document.getElementById('bookings-list');
// Elementos del modal de confirmación
const confirmationOverlay = document.getElementById('confirmation-modal-overlay');
const confirmationModal = document.getElementById('confirmation-modal');
const confirmationText = document.getElementById('confirmation-modal-text');
const confirmArrivalBtn = document.getElementById('confirm-arrival-btn');
const confirmNoshowBtn = document.getElementById('confirm-noshow-btn');
const confirmationCloseBtn = document.getElementById('confirmation-modal-close-btn');

// --- INICIO: Elementos del DOM para el nuevo modal de Visita Inmediata ---
const showWalkInModalBtn = document.getElementById('show-walk-in-modal-btn');
const walkInModalOverlay = document.getElementById('walk-in-modal-overlay');
const walkInModal = document.getElementById('walk-in-modal');
const walkInCloseBtn = document.getElementById('walk-in-modal-close-btn');
const walkInForm = document.getElementById('walk-in-form');
const walkInServiceSelect = document.getElementById('walk-in-service-select');
const walkInStatus = document.getElementById('walk-in-status');
// --- FIN: Elementos del DOM para el nuevo modal ---


// --- INICIALIZACIÓN ---
async function initProfileModule() {
    if (typeof supabaseClient === 'undefined') {
        console.error("Profile Error: supabaseClient no está definido.");
        if (saveStatus) saveStatus.textContent = "Error crítico de conexión.";
        return;
    }
    console.log("Módulo de perfil iniciado correctamente. ✅");
    
    setupEventListeners();
    setupDashboardNavigation();
    setupMobileMenu();
    setupAlertModalListeners();
    setupConfirmationModalListeners();
    setupPaymentModalListeners();
    setupWalkInModalListeners(); // AÑADIDO: configurar listeners del nuevo modal
    setupCalendarActionModal();
   

    await loadInitialData();

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.href = 'login_register.html';
        }
    });

    document.addEventListener('showConfirmationModal', (e) => {
        if (e.detail && e.detail.cita) {
            showConfirmationModal(e.detail.cita);
        }
    });
    document.addEventListener('navigateToDate', (e) => {
        if (e.detail && e.detail.dateString) {
            navigateToDateFromNotification(e.detail.dateString);
        }
    });
     
    document.addEventListener('datosCambiadosPorReserva', () => {
        console.log('Cambio en datos de reservas detectado. Recargando estadísticas...');
        
        loadDashboardStats();

        const reportesSection = document.getElementById('reportes');
        if (reportesSection && reportesSection.classList.contains('active')) {
            const activeButton = document.querySelector('.report-btn.active');
            const period = activeButton ? activeButton.dataset.period : 'week';
            loadReportData(period);
        }
    });
}

// --- LÓGICA DE CARGA DE DATOS ---
async function fetchBarberClients() {
    if (!currentUserId) return;
    const { data, error } = await supabaseClient
        .from('clientes')
        .select('id, nombre, apellido, telefono')
        .eq('barbero_id', currentUserId);

    if (error) {
        console.error('Error fetching clients for walk-in:', error);
        barberClients = [];
        return;
    }
    barberClients = data || [];
}

async function loadInitialData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = 'login_register.html';
        return;
    }
    currentUserId = user.id;
    
    // Iniciar los checkers recurrentes para citas del día
    
    await fetchBarberClients();
    startConfirmationChecker();
    
    // Verificar citas pasadas no confirmadas una sola vez al cargar
    await checkPastUnconfirmedAppointments();

    if (saveStatus) saveStatus.textContent = "Cargando datos...";
    try {
        const [barberRes, masterServicesRes, barberServicesRes, availabilityRes] = await Promise.all([
            supabaseClient.from('barberos').select('*').eq('user_id', currentUserId).single(),
            supabaseClient.from('servicios_maestro').select('*').order('nombre'),
            supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId),
            supabaseClient.from('disponibilidad').select('*').eq('barbero_id', currentUserId).order('dia_semana').order('hora_inicio')
        ]);

        if (barberRes.error && barberRes.error.code !== 'PGRST116') throw new Error(`Perfil: ${barberRes.error.message}`);
        if (masterServicesRes.error) throw new Error(`Servicios Maestros: ${masterServicesRes.error.message}`);
        if (barberServicesRes.error) throw new Error(`Servicios Barbero: ${barberServicesRes.error.message}`);
        if (availabilityRes.error) throw new Error(`Disponibilidad: ${availabilityRes.error.message}`);

        masterServices = masterServicesRes.data || [];
        barberServicesData = barberServicesRes.data || []; // AÑADIDO: Guardar los servicios del barbero

        weeklyAvailabilityData = [[], [], [], [], [], [], []];
        (availabilityRes.data || []).forEach(slot => {
            if (slot.dia_semana >= 0 && slot.dia_semana <= 6) {
                weeklyAvailabilityData[slot.dia_semana].push({
                    id: slot.id,
                    hora_inicio: slot.hora_inicio.substring(0, 5),
                    hora_fin: slot.hora_fin.substring(0, 5)
                });
            }
        });

        renderBarberForm(barberRes.data);
        renderServices(barberServicesData);
        renderBookingLink(currentUserId);
        
        initCalendar();
        loadDashboardStats();
        document.querySelector('.menu-link[data-target="dashboard"]').dataset.loaded = true;
        if (saveStatus) saveStatus.textContent = "";

    } catch (error) {
        console.error('Error cargando datos iniciales:', error);
        if (saveStatus) saveStatus.textContent = `Error al cargar: ${error.message}`;
    }
}


// ===== INICIO: LÓGICA DEL MODAL DE VISITA INMEDIATA =====

/**
 * Configura los listeners para el nuevo modal de visita inmediata.
 */
function setupWalkInModalListeners() {
    // Referencias a los nuevos botones
    const frequentClientBtn = document.getElementById('walk-in-frequent-client-btn');
    const newClientBtn = document.getElementById('walk-in-new-client-btn');
    const clientSearchInput = document.getElementById('walk-in-client-search');

    if (showWalkInModalBtn) {
        showWalkInModalBtn.addEventListener('click', openWalkInModal);
    }
    if (walkInCloseBtn) {
        walkInCloseBtn.addEventListener('click', closeWalkInModal);
    }
    if (walkInModalOverlay) {
        walkInModalOverlay.addEventListener('click', (e) => {
            if (e.target === walkInModalOverlay) {
                closeWalkInModal();
            }
        });
    }
    if (walkInForm) {
        walkInForm.addEventListener('submit', handleWalkInSubmit);
    }

    // Lógica para los nuevos botones de selección
    if (frequentClientBtn) {
        frequentClientBtn.addEventListener('click', () => {
            document.getElementById('walk-in-client-type-selection').style.display = 'none';
            document.getElementById('walk-in-form').style.display = 'block';
            document.getElementById('walk-in-frequent-client-container').style.display = 'block';
            document.getElementById('walk-in-client-details-container').style.display = 'block'; // Lo mostramos para que se rellene
        });
    }
    if (newClientBtn) {
        newClientBtn.addEventListener('click', () => {
            document.getElementById('walk-in-client-type-selection').style.display = 'none';
            document.getElementById('walk-in-form').style.display = 'block';
            document.getElementById('walk-in-frequent-client-container').style.display = 'none';
            document.getElementById('walk-in-client-details-container').style.display = 'block';
        });
    }
    
    // Listener para la búsqueda
    if(clientSearchInput) {
        clientSearchInput.addEventListener('input', () => showWalkInClientResults(clientSearchInput.value));
    }
}


/**
 * Abre el modal y puebla el selector de servicios.
 */
function openWalkInModal() {
    if (!walkInModalOverlay) return;
    
    // Primero, reseteamos el modal a su estado inicial de selección
    closeWalkInModal(); 

    // Poblar el select de servicios
    walkInServiceSelect.innerHTML = '<option value="" disabled selected>Selecciona un servicio...</option>';
    if (barberServicesData && barberServicesData.length > 0) {
        barberServicesData.forEach(service => {
            const option = document.createElement('option');
            const serviceData = service.servicios_maestro 
                ? { ...service, nombre_personalizado: service.nombre_personalizado || service.servicios_maestro.nombre }
                : service;
            option.value = service.id;
            option.textContent = `${serviceData.nombre_personalizado} - $${service.precio}`;
            option.dataset.serviceData = JSON.stringify(serviceData);
            walkInServiceSelect.appendChild(option);
        });
    } else {
        walkInServiceSelect.innerHTML = '<option value="">No tienes servicios configurados</option>';
    }

    // Mostrar el modal
    walkInModalOverlay.classList.add('active');
}

// js/barberProfile.js

/**
 * Cierra el modal de visita inmediata y resetea el formulario,
 * actuando como una acción de cancelación.
 */
function closeWalkInModal() {
    if (walkInModalOverlay) {
        walkInModalOverlay.classList.remove('active');
    }

    // Ocultar y resetear todo
    const typeSelection = document.getElementById('walk-in-client-type-selection');
    const form = document.getElementById('walk-in-form');
    const frequentContainer = document.getElementById('walk-in-frequent-client-container');
    const detailsContainer = document.getElementById('walk-in-client-details-container');
    const resultsList = document.getElementById('walk-in-client-results');

    if (form) form.reset();
    if (walkInStatus) {
        walkInStatus.textContent = '';
        walkInStatus.className = 'status-message';
    }
    const submitBtn = document.getElementById('walk-in-submit-btn');
    if (submitBtn) submitBtn.disabled = false;
    
    // Devolver a la vista inicial
    if(typeSelection) typeSelection.style.display = 'block';
    if(form) form.style.display = 'none';
    if(frequentContainer) frequentContainer.style.display = 'none';
    if(detailsContainer) detailsContainer.style.display = 'none';
    if(resultsList) resultsList.innerHTML = '';
}
function showWalkInClientResults(searchTerm) {
    const resultsList = document.getElementById('walk-in-client-results');
    resultsList.innerHTML = '';
    if (!searchTerm) {
        resultsList.style.display = 'none';
        return;
    }

    const filteredClients = barberClients.filter(client =>
        `${client.nombre} ${client.apellido || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filteredClients.length > 0) {
        filteredClients.forEach(client => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = `${client.nombre} ${client.apellido || ''}`;
            item.addEventListener('click', () => handleWalkInClientSelection(client));
            resultsList.appendChild(item);
        });
    }
    resultsList.style.display = 'block';
}

function handleWalkInClientSelection(client) {
    document.getElementById('walk-in-client-name').value = `${client.nombre} ${client.apellido || ''}`.trim();
    document.getElementById('walk-in-client-phone').value = client.telefono || '';
    const resultsList = document.getElementById('walk-in-client-results');
    resultsList.innerHTML = '';
    resultsList.style.display = 'none';
}


// js/barberProfile.js

/**
 * Maneja el envío del formulario de visita inmediata.
 * Crea el cliente (si es nuevo), crea la cita y abre el modal de pago.
 */


// REEMPLAZA ESTA FUNCIÓN EN js/barberProfile.js

async function handleWalkInSubmit(e) {
    e.preventDefault();
    
    const selectedOption = walkInServiceSelect.options[walkInServiceSelect.selectedIndex];
    const clientName = document.getElementById('walk-in-client-name').value.trim();
    const clientPhone = document.getElementById('walk-in-client-phone').value.trim();

    if (!selectedOption.value || !clientName || !clientPhone) {
        alert("Por favor, completa todos los campos: servicio, nombre y teléfono.");
        return;
    }

    const submitBtn = document.getElementById('walk-in-submit-btn');
    submitBtn.disabled = true;
    walkInStatus.textContent = 'Procesando...';
    walkInStatus.className = 'status-message';

    try {
        const serviceData = JSON.parse(selectedOption.dataset.serviceData);
        
        const nameParts = clientName.split(' ');
        const nombre = nameParts.shift() || '';
        const apellido = nameParts.join(' ');

        const { data: client, error: clientError } = await supabaseClient
            .from('clientes')
            .upsert({ barbero_id: currentUserId, nombre, apellido, telefono: clientPhone }, { onConflict: 'barbero_id, telefono' })
            .select()
            .single();

        if (clientError) throw new Error(`Error al guardar cliente: ${clientError.message}`);
        
        // Se notifica a otros módulos (como la lista de clientes) que un cliente pudo haber cambiado.
        document.dispatchEvent(new CustomEvent('clientListChanged'));
        
        const now = new Date();
        const startTime = now.toTimeString().slice(0, 8);
        const duration = serviceData.duracion_minutos || 30;
        const endTime = new Date(now.getTime() + duration * 60000).toTimeString().slice(0, 8);

        const newCita = {
            barbero_id: currentUserId,
            cliente_id: client.id,
            cliente_nombre: clientName,
            cliente_telefono: clientPhone,
            servicio_reservado_id: serviceData.id,
            fecha_cita: toLocalISODate(now),
            hora_inicio_cita: startTime,
            hora_fin_cita: endTime,
            estado: APPOINTMENT_STATUS.IN_PROGRESS, // Se marca como "en proceso"
            metodo_pago: null,
            estado_pago: 'pendiente',
            // ================== INICIO DE LA CORRECCIÓN ==================
            precio_final: serviceData.precio // ¡CORREGIDO! Guardamos el precio del servicio.
            // =================== FIN DE LA CORRECCIÓN ====================
        };

        const { data: insertedCita, error: citaError } = await supabaseClient
            .from('citas')
            .insert(newCita)
            .select()
            .single();

        if (citaError) throw new Error(`Error al crear la cita: ${citaError.message}`);

        walkInStatus.textContent = '¡Servicio iniciado! El pago se solicitará al finalizar.';
        walkInStatus.className = 'status-message success';
        
        // Se notifica al dashboard y a los reportes que los datos han cambiado.
        document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));

        setTimeout(() => {
            closeWalkInModal();
        }, 2000);

    } catch (error) {
        console.error("Error en visita inmediata:", error);
        walkInStatus.textContent = `Error: ${error.message}`;
        walkInStatus.className = 'status-message error';
    } finally {
        submitBtn.disabled = false;
    }
}
async function checkUpcomingAppointments() {
    if (!currentUserId) return;
    const now = new Date();
    const { data: citas, error } = await supabaseClient
        .from('citas')
        .select('id, fecha_cita, hora_inicio_cita, cliente_nombre, cliente_telefono')
        .eq('barbero_id', currentUserId)
        .eq('fecha_cita', now.toISOString().split('T')[0])
        .in('estado', [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.PENDING])
        .gte('hora_inicio_cita', now.toTimeString().slice(0, 8));
    if (error) { console.error("Error buscando citas próximas:", error); return; }
    if (!citas) return;
    citas.forEach(cita => {
        if (notifiedAppointmentIds.has(cita.id)) return;
        const appointmentTime = new Date(`${cita.fecha_cita}T${cita.hora_inicio_cita}`);
        const diffMinutes = (appointmentTime.getTime() - now.getTime()) / 60000;
        if (diffMinutes <= 30 && diffMinutes > 0) {
            showReminderAlert(cita);
            notifiedAppointmentIds.add(cita.id);
        }
    });
}

function showReminderAlert(cita) {
    const overlay = document.getElementById('appointment-alert-overlay');
    const title = document.getElementById('alert-modal-title');
    const messageTextarea = document.getElementById('alert-modal-message');
    const whatsappBtn = document.getElementById('alert-modal-whatsapp-btn');
    if (!overlay || !title || !messageTextarea || !whatsappBtn) return;

    title.textContent = `¡Cita en ~30 min con ${cita.cliente_nombre}!`;
    messageTextarea.value = `Hola ${cita.cliente_nombre}, te escribo para recordarte que nuestra cita es dentro de unos 30 minutos. ¡Por favor, confírmame tu asistencia!`;
    const updateWhatsappLink = () => {
        if (!cita.cliente_telefono) {
            whatsappBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Cliente sin teléfono';
            whatsappBtn.style.pointerEvents = 'none';
            whatsappBtn.style.backgroundColor = '#6c757d';
            return;
        }
        const message = messageTextarea.value;
        const phone = cita.cliente_telefono.replace(/[\s+()-]/g, '');
        whatsappBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    };
    updateWhatsappLink();
    messageTextarea.onkeyup = updateWhatsappLink;
    overlay.classList.add('active');
    const audio = new Audio('https://cdn.freesound.org/previews/571/571408_6424653-lq.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log("No se pudo reproducir sonido de alerta.", e));
}

function setupAlertModalListeners() {
    const overlay = document.getElementById('appointment-alert-overlay');
    const closeBtn = document.getElementById('alert-modal-close-btn');
    const modal = document.getElementById('appointment-alert-modal');
    const closeModal = () => { if (overlay) overlay.classList.remove('active'); };
    if (overlay) overlay.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if(modal) modal.addEventListener('click', (e) => e.stopPropagation());
}




// ===== SECCIÓN DE CONFIRMACIÓN DE ASISTENCIA (MODAL DE CONFIRMACIÓN) =====
function startConfirmationChecker() {
    if (confirmationCheckInterval) clearInterval(confirmationCheckInterval);
    checkAppointmentsForConfirmation();
    confirmationCheckInterval = setInterval(checkAppointmentsForConfirmation, 60000); // Se ejecuta cada minuto
}

// =========================================================================
// INICIO DE LA MEJORA: El modal de confirmación ahora aparece al finalizar el servicio.
// =========================================================================
// REEMPLAZA ESTA FUNCIÓN EN js/barberProfile.js

async function checkAppointmentsForConfirmation() {
    if (!currentUserId) return;
    const now = new Date();
    
    // ================== INICIO DE LA CORRECCIÓN ==================
    // Se simplifica y robustece la consulta para traer todos los campos (*) de la cita.
    const { data: citas, error } = await supabaseClient
        .from('citas')
        .select('*') // Traemos todos los campos para asegurar que `precio_final` esté presente.
        .eq('barbero_id', currentUserId)
        .eq('fecha_cita', toLocalISODate(now)) 
        .in('estado', [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.IN_PROGRESS]);
    // =================== FIN DE LA CORRECCIÓN ====================
        
    if (error) {
        console.error("Error buscando citas de hoy para confirmación:", error);
        return;
    }
    if (!citas) return;

    for (const cita of citas) {
        // La lógica de la fecha de finalización puede fallar si la hora es null, añadimos un fallback.
        const endTimeString = cita.hora_fin_cita || '00:00:00';
        const appointmentEndTime = new Date(`${cita.fecha_cita}T${endTimeString}`);

        if (now >= appointmentEndTime) {
            if (!promptedConfirmationIds.has(cita.id)) {
                showConfirmationModal(cita);
                // La creación de la notificación se mueve a una función más robusta
                await createConfirmationNotification(cita);
                promptedConfirmationIds.add(cita.id);
            }
        }
    }
}
// =========================================================================
// FIN DE LA MEJORA
// =========================================================================


// REEMPLAZA ESTA FUNCIÓN EN js/barberProfile.js

async function createConfirmationNotification(cita) {
    // Usamos .maybeSingle() para evitar el error 406 si se encuentran 0 o más de 1 resultado.
    // La consulta es más específica para evitar falsos positivos.
    const { data: existingNotif } = await supabaseClient
        .from('notificaciones')
        .select('id')
        .eq('cita_id', cita.id)
        .eq('tipo', 'confirmacion_asistencia')
        .maybeSingle();

    if (existingNotif) return; // Si ya existe, no hacemos nada.

    const mensaje = `Por favor, confirma la asistencia para la cita de ${cita.cliente_nombre} a las ${cita.hora_inicio_cita.substring(0, 5)}.`;
    
    const { error } = await supabaseClient
        .from('notificaciones')
        .insert({ 
            barbero_id: cita.barbero_id, 
            cita_id: cita.id, 
            mensaje: mensaje, 
            leido: false, 
            tipo: 'confirmacion_asistencia' 
        });

    if (error) {
        console.error("Error al crear la notificación de confirmación:", error);
    }
}


// ===== LÓGICA DE VERIFICACIÓN DE CITAS PASADAS =====

async function checkPastUnconfirmedAppointments() {
    if (!currentUserId) return;
    // ================== INICIO DE LA CORRECCIÓN ==================
    const today = toLocalISODate(new Date());
    // =================== FIN DE LA CORRECCIÓN ====================

    const { data: pastCitas, error } = await supabaseClient
        .from('citas')
        .select('*')
        .eq('barbero_id', currentUserId)
        .in('estado', [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.IN_PROGRESS])
        .lt('fecha_cita', today);

    if (error) {
        console.error("Error buscando citas pasadas no confirmadas:", error);
        return;
    }

    if (pastCitas && pastCitas.length > 0) {
        console.log(`Encontradas ${pastCitas.length} citas pasadas por confirmar. Iniciando cola de confirmación.`);
        processConfirmationQueue(pastCitas);
    }
}
function processConfirmationQueue(queue) {
    if (!queue || queue.length === 0) {
        console.log("Cola de confirmación de citas pasadas finalizada.");
        fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        return;
    }

    const cita = queue.shift();
    promptedConfirmationIds.add(cita.id);

    const onModalCloseCallback = () => processConfirmationQueue(queue);
    showConfirmationModal(cita, onModalCloseCallback);
}


/**
 * Muestra el modal de confirmación de asistencia.
 * @param {object} cita - El objeto de la cita.
 * @param {function|null} onModalCloseCallback - Función a ejecutar cuando el modal se cierra.
 */
function showConfirmationModal(cita, onModalCloseCallback = null) {
    if (!confirmationOverlay || !cita) return;

    const citaDate = new Date(cita.fecha_cita + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let message;
    if (citaDate < today) {
        message = `¿El cliente ${cita.cliente_nombre} se presentó a su cita del día ${citaDate.toLocaleDateString('es-ES')} a las ${cita.hora_inicio_cita.substring(0, 5)}?`;
    } else {
        message = `¿El cliente ${cita.cliente_nombre} se presentó a su cita de las ${cita.hora_inicio_cita.substring(0, 5)}?`;
    }
    confirmationText.textContent = message;

    confirmArrivalBtn.onclick = () => {
        closeConfirmationModal();
        showPaymentModal(cita);
        if (onModalCloseCallback) onModalCloseCallback();
    };

    confirmNoshowBtn.onclick = async () => {
        closeConfirmationModal(); // Se cierra inmediatamente
        await markAppointmentAsNoShow(cita.id, cita.fecha_cita); 
        if (onModalCloseCallback) onModalCloseCallback();
    };
    
    confirmationCloseBtn.onclick = () => {
        closeConfirmationModal();
        if (onModalCloseCallback) onModalCloseCallback();
    };

    confirmationOverlay.classList.add('active');
    const audio = new Audio('https://cdn.freesound.org/previews/571/571408_6424653-lq.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log("No se pudo reproducir sonido de confirmación.", e));
}


function closeConfirmationModal() {
    if (confirmationOverlay) confirmationOverlay.classList.remove('active');
}

function setupConfirmationModalListeners() {
    if (!confirmationOverlay || !confirmationModal) return;
    confirmationOverlay.addEventListener('click', closeConfirmationModal);
    confirmationModal.addEventListener('click', (e) => e.stopPropagation());
}

async function updateAppointmentStatus(citaId, newStatus, citaDate) {
    closeConfirmationModal();
    if(saveStatus) saveStatus.textContent = "Actualizando estado...";
    const { error } = await supabaseClient.from('citas').update({ estado: newStatus }).eq('id', citaId);
    if (error) {
        alert('Error al actualizar la cita: ' + error.message);
        if(saveStatus) saveStatus.textContent = "Error.";
    } else {
        if(saveStatus) saveStatus.textContent = "Estado actualizado.";
        
        if (newStatus === APPOINTMENT_STATUS.COMPLETED) {
            document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
        }
        
        fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        const selectedDay = document.querySelector('.calendar-day.selected-day');
        if (citaDate && selectedDay && selectedDay.dataset.date === citaDate) {
            loadAndRenderBookingsForDate(citaDate);
        }
    }
    setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 3000);
}


/**
 * Marca una cita como "no asistió" en la base de datos.
 * @param {string} citaId - El ID de la cita a actualizar.
 * @param {string} citaDate - La fecha de la cita para refrescar la UI.
 */
async function markAppointmentAsNoShow(citaId, citaDate) {
    if (!confirm('¿Estás seguro de que quieres marcar esta cita como inasistencia?')) {
        return;
    }
    
    if(saveStatus) saveStatus.textContent = "Actualizando estado...";

    const { error } = await supabaseClient
        .from('citas')
        .update({ estado: APPOINTMENT_STATUS.NO_SHOW })
        .eq('id', citaId);

    if (error) {
        alert('Error al actualizar la cita: ' + error.message);
        if(saveStatus) saveStatus.textContent = "Error al actualizar.";
    } else {
        if(saveStatus) saveStatus.textContent = "Estado de inasistencia guardado.";
        
        document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));

        fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        const selectedDay = document.querySelector('.calendar-day.selected-day');
        if (citaDate && selectedDay && selectedDay.dataset.date === citaDate) {
            loadAndRenderBookingsForDate(citaDate);
        }
    }
    setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 3000);
}


// --- LÓGICA DE NAVEGACIÓN Y MENÚS ---


function setupDashboardNavigation() {
    const menuLinks = document.querySelectorAll('.menu-link');
    const contentSections = document.querySelectorAll('.content-section');
    const loader = document.getElementById('section-loader-overlay'); // Obtenemos referencia al loader

    menuLinks.forEach(link => {
        // La función del listener ahora es async para poder usar await
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if (!targetId || link.classList.contains('active')) return; // No hacer nada si ya está activa

            if (loader) loader.classList.add('active'); // 1. Muestra el loader INMEDIATAMENTE

            // Usamos un bloque try...finally para asegurar que el loader siempre se oculte,
            // incluso si hay un error al cargar los datos.
            try {
                // 2. Espera un instante para que el navegador renderice el loader antes de continuar.
                await new Promise(resolve => setTimeout(resolve, 50)); 

                // Ocultamos todas las secciones
                contentSections.forEach(section => section.classList.remove('active'));
                
                // 3. Carga los datos necesarios para la sección específica
                // La palabra 'await' detiene la ejecución aquí hasta que la carga termine.
                if (targetId === 'dashboard' && !link.dataset.loaded) {
                    await loadDashboardStats();
                    link.dataset.loaded = true;
                }
                if (targetId === 'reportes' && !link.dataset.loaded) {
                    setupReportControls();
                    await loadReportData('week');
                    link.dataset.loaded = true;
                }
                 if (targetId === 'clientes' && !link.dataset.loaded) {
                    // El evento fuerza al módulo de clientes a refrescar su lista
                    document.dispatchEvent(new CustomEvent('clientListChanged'));
                    link.dataset.loaded = true;
                }
                 if (targetId === 'reservas' && !link.dataset.loaded) {
                    // Carga inicial del mes actual para el calendario
                    await fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
                    link.dataset.loaded = true;
                }
                
                // Actualiza la clase activa en los enlaces del menú
                menuLinks.forEach(l => l.getAttribute('data-target') && l.classList.remove('active'));
                link.classList.add('active');
                
                // 4. Muestra la sección de destino
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.classList.add('active');
                }

            } catch (error) {
                console.error(`Error al cargar la sección ${targetId}:`, error);
                // Opcional: Mostrar un mensaje de error al usuario
            } finally {
                // 5. Oculta el loader, haya funcionado o no la carga.
                if (loader) loader.classList.remove('active');
            }
        });
    });
}
function setupMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const menu = document.querySelector('.dashboard-menu');
    const overlay = document.querySelector('.menu-overlay');
    const menuLinks = document.querySelectorAll('.dashboard-menu a');
    if (!menuToggle || !menu || !overlay) return;
    const closeMenu = () => {
        menu.classList.remove('menu-open');
        overlay.classList.remove('active');
    };
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('menu-open');
        overlay.classList.toggle('active');
    });
    overlay.addEventListener('click', closeMenu);
    menuLinks.forEach(link => link.addEventListener('click', closeMenu));
}

async function loadDashboardStats() {
    const loadingStatus = document.getElementById('dashboard-loading-status');
    const statsGrid = document.getElementById('dashboard-stats-grid');
    if (!loadingStatus || !statsGrid || !currentUserId) return;

    loadingStatus.style.display = 'block';
    statsGrid.style.display = 'none';

    try {
        const today = new Date().toISOString().split('T')[0];
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

        const [
            { count: activeBookings, error: bookingsError },
            { count: totalClients, error: clientsError },
            { data: monthlyIncomeData, error: incomeError }
        ] = await Promise.all([
            supabaseClient.from('citas').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId).gte('fecha_cita', today),
            supabaseClient.from('clientes').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId),
            supabaseClient.from('citas').select('precio_final').eq('barbero_id', currentUserId).gte('fecha_cita', firstDayOfMonth).lte('fecha_cita', today).eq('estado', APPOINTMENT_STATUS.COMPLETED).eq('estado_pago', 'pagado')
        ]);

        if (bookingsError) throw new Error(`Error al cargar reservas: ${bookingsError.message}`);
        if (clientsError) throw new Error(`Error al cargar clientes: ${clientsError.message}`);
        if (incomeError) throw new Error(`Error al cargar ingresos: ${incomeError.message}`);

        const monthlyIncome = (monthlyIncomeData || []).reduce((sum, item) => sum + (item.precio_final || 0), 0);
        
        document.getElementById('stat-active-bookings').textContent = activeBookings || 0;
        document.getElementById('stat-unique-clients').textContent = totalClients || 0;
        document.getElementById('stat-monthly-income').textContent = `$${monthlyIncome.toFixed(2)}`;
        
        loadingStatus.style.display = 'none';
        statsGrid.style.display = 'grid';

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        loadingStatus.textContent = 'Error al cargar estadísticas.';
        statsGrid.style.display = 'grid';
        document.getElementById('stat-active-bookings').textContent = '-';
        document.getElementById('stat-unique-clients').textContent = 'Error';
        document.getElementById('stat-monthly-income').textContent = '-';
    }
}


// ===== FUNCIONES PARA REPORTES =====

function setupReportControls() {
    const reportButtons = document.querySelectorAll('.report-btn');
    reportButtons.forEach(button => {
        button.addEventListener('click', () => {
            reportButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const period = button.dataset.period;
            loadReportData(period);
        });
    });
}
/**
 * Formatea un objeto Date a un string YYYY-MM-DD respetando la zona horaria local del navegador.
 * Evita los problemas de conversión a UTC de la función .toISOString().
 * @param {Date} date El objeto Date a formatear.
 * @returns {string} El string de fecha en formato YYYY-MM-DD.
 */
const toLocalISODate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

function getPeriodDates(period) {
    const now = new Date(); // Fecha y hora actual en la zona horaria del navegador
    const current_end = new Date(now); // El final del periodo actual es siempre el momento presente

    let current_start, previous_start, previous_end;

    if (period === 'year') {
        // Inicio del periodo actual: 1 de enero de este año
        current_start = new Date(now.getFullYear(), 0, 1);
        
        // El periodo anterior termina el día antes de que empiece el actual (31 de dic del año pasado)
        previous_end = new Date(current_start.getTime());
        previous_end.setDate(current_start.getDate() - 1);
        
        // El periodo anterior empieza el 1 de enero del año pasado
        previous_start = new Date(previous_end.getFullYear(), 0, 1);

    } else if (period === 'month') {
        // Inicio del periodo actual: día 1 de este mes
        current_start = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // El periodo anterior termina el día antes de que empiece el actual (último día del mes pasado)
        previous_end = new Date(current_start.getTime());
        previous_end.setDate(current_start.getDate() - 1);
        
        // El periodo anterior empieza el día 1 del mes pasado
        previous_start = new Date(previous_end.getFullYear(), previous_end.getMonth(), 1);

    } else { // 'week', asumiendo que la semana empieza en Domingo
        // Clonamos 'now' y lo ponemos al inicio del día para cálculos consistentes
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = startOfToday.getDay(); // 0 para Domingo, 1 para Lunes, etc.

        // Inicio del periodo actual: el domingo de esta semana
        current_start = new Date(startOfToday.getTime());
        current_start.setDate(startOfToday.getDate() - dayOfWeek);
        
        // El periodo anterior termina el día antes de que empiece el actual (el sábado pasado)
        previous_end = new Date(current_start.getTime());
        previous_end.setDate(current_start.getDate() - 1);

        // El periodo anterior empieza 7 días antes que el actual (el domingo de la semana pasada)
        previous_start = new Date(current_start.getTime());
        previous_start.setDate(current_start.getDate() - 7);
    }

    return {
        current: { start: toLocalISODate(current_start), end: toLocalISODate(current_end) },
        previous: { start: toLocalISODate(previous_start), end: toLocalISODate(previous_end) }
    };
}



async function loadReportData(period = 'week') {
    const loadingStatus = document.getElementById('report-loading-status');
    const reportGrid = document.getElementById('report-stats-grid');
    const transactionListContainer = document.querySelector('.transaction-list-container');
    const transactionListEl = document.createElement('div');
    transactionListEl.id = 'transaction-list';


    if (!loadingStatus || !reportGrid || !transactionListContainer || !currentUserId) return;

    const oldList = document.getElementById('transaction-list');
    if(oldList) oldList.remove();

    loadingStatus.style.display = 'block';
    reportGrid.style.opacity = '0.5';
    transactionListContainer.appendChild(transactionListEl);
    transactionListEl.innerHTML = '';

    try {
        const { current, previous } = getPeriodDates(period);

        const [
            currentTransactionsRes, 
            previousIncomeRes,
            currentAppointmentsRes, 
            previousAppointmentsRes,
            currentClientsRes, 
            previousClientsRes
        ] = await Promise.all([
            supabaseClient.from('citas')
                .select('*, barbero_servicios(*, servicios_maestro(*))')
                .eq('barbero_id', currentUserId)
                .gte('fecha_cita', current.start)
                .lte('fecha_cita', current.end)
                .in('estado', [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.IN_PROGRESS, APPOINTMENT_STATUS.CONFIRMED]),
            
            supabaseClient.from('citas').select('precio_final').eq('barbero_id', currentUserId).gte('fecha_cita', previous.start).lte('fecha_cita', previous.end).eq('estado', APPOINTMENT_STATUS.COMPLETED).eq('estado_pago', 'pagado'),
            
            supabaseClient.from('citas').select('fecha_cita', { count: 'exact' }).eq('barbero_id', currentUserId).gte('fecha_cita', current.start).lte('fecha_cita', current.end)
                .in('estado', [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.IN_PROGRESS, APPOINTMENT_STATUS.CONFIRMED]),
            
            supabaseClient.from('citas').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId).gte('fecha_cita', previous.start).lte('fecha_cita', previous.end).in('estado', [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.IN_PROGRESS, APPOINTMENT_STATUS.CONFIRMED]),
            supabaseClient.from('clientes').select('created_at', { count: 'exact' }).eq('barbero_id', currentUserId).gte('created_at', current.start + 'T00:00:00').lte('created_at', current.end + 'T23:59:59'),
            supabaseClient.from('clientes').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId).gte('created_at', previous.start + 'T00:00:00').lte('created_at', previous.end + 'T23:59:59'),
        ]);

        const errors = [currentTransactionsRes, previousIncomeRes, currentAppointmentsRes, previousAppointmentsRes, currentClientsRes, previousClientsRes].map(r => r.error).filter(Boolean);
        if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));
        
        const incomeCurrentTotal = (currentTransactionsRes.data || [])
            .filter(item => item.estado_pago === 'pagado')
            .reduce((sum, item) => sum + (item.precio_final || 0), 0);

        const incomePreviousTotal = (previousIncomeRes.data || []).reduce((sum, item) => sum + (item.precio_final || 0), 0);
        
        let incomePercentage = 0;
        if (incomePreviousTotal > 0) {
            incomePercentage = ((incomeCurrentTotal - incomePreviousTotal) / incomePreviousTotal) * 100;
        } else if (incomeCurrentTotal > 0) {
            incomePercentage = 100;
        }

        const appointmentsTotal = currentAppointmentsRes.count || 0;
        let appointmentsPercentage = 0;
        if (previousAppointmentsRes.count > 0) {
            appointmentsPercentage = ((appointmentsTotal - previousAppointmentsRes.count) / previousAppointmentsRes.count) * 100;
        } else if (appointmentsTotal > 0) {
            appointmentsPercentage = 100;
        }

        const clientsTotal = currentClientsRes.count || 0;
        let clientsPercentage = 0;
        if (previousClientsRes.count > 0) {
            clientsPercentage = ((clientsTotal - previousClientsRes.count) / previousClientsRes.count) * 100;
        } else if (clientsTotal > 0) {
            clientsPercentage = 100;
        }
        
        const reportData = {
            period,
            income: { total: incomeCurrentTotal, percentage: incomePercentage, data: currentTransactionsRes.data || [] },
            appointments: { total: appointmentsTotal, percentage: appointmentsPercentage, data: currentAppointmentsRes.data || [] },
            clients: { total: clientsTotal, percentage: clientsPercentage, data: currentClientsRes.data || [] }
        };
        
        // Guardar la lista completa y renderizarla
        currentPeriodAppointments = [...(currentTransactionsRes.data || [])];
        renderReportCharts(reportData);
        renderTransactionList(currentPeriodAppointments);

        // Limpiar filtros al cargar nuevos datos
        document.getElementById('transaction-search-input').value = '';
        document.getElementById('toggle-debt-btn').classList.remove('active');

    } catch (error) {
        console.error('Error cargando datos del reporte:', error);
        reportGrid.innerHTML = `<p style="color:var(--danger-color); grid-column: 1 / -1;">Error al cargar el reporte: ${error.message}</p>`;
        transactionListEl.innerHTML = `<p class="no-transactions">Error al cargar transacciones.</p>`;
    } finally {
        loadingStatus.style.display = 'none';
        reportGrid.style.opacity = '1';
    }
}


function groupDataForChart(data, period, dateField, mode = 'count', sumField = 'precio_final') {
    const formatLabel = (date, p) => {
        if (p === 'year') return monthsOfYear[date.getMonth()].substring(0, 3);
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    const { current } = getPeriodDates(period);
    const startDate = new Date(current.start + 'T00:00:00');
    const endDate = new Date(current.end + 'T23:59:59');
    
    let groups = {};
    let categories = [];
    
    if (period === 'year') {
        for (let i = 0; i < 12; i++) {
            const monthName = monthsOfYear[i].substring(0, 3);
            groups[monthName] = 0;
            categories.push(monthName);
        }
    } else { 
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const label = formatLabel(new Date(d), period);
            if (!groups.hasOwnProperty(label)) {
                groups[label] = 0;
                categories.push(label);
            }
        }
    }
    
    data.forEach(item => {
        if (mode === 'sum' && item.estado_pago !== 'pagado') {
            return;
        }
        const date = new Date(item[dateField]);
        const label = formatLabel(date, period);
        if (groups.hasOwnProperty(label)) {
            if (mode === 'sum') {
                groups[label] += item[sumField] || 0;
            } else {
                groups[label] += 1;
            }
        }
    });
    
    return { series: Object.values(groups), categories };
}


function renderReportCharts(data) {
    if (typeof ReportCharts === 'undefined') {
        console.error("Módulo ReportCharts no encontrado.");
        return;
    }
    
    const incomeChartData = groupDataForChart(data.income.data, data.period, 'fecha_cita', 'sum', 'precio_final');
    ReportCharts.renderChart({
        chartId: 'income-area-chart',
        series: incomeChartData.series,
        categories: incomeChartData.categories,
        total: data.income.total,
        percentage: data.income.percentage,
        valueElId: 'income-stat-value',
        percentageElId: 'income-percentage',
        prefix: '$',
        decimals: 2,
        themeColor: 'var(--success-color)'
    });

    const appointmentsChartData = groupDataForChart(data.appointments.data, data.period, 'fecha_cita', 'count');
    ReportCharts.renderChart({
        chartId: 'appointments-area-chart',
        series: appointmentsChartData.series,
        categories: appointmentsChartData.categories,
        total: data.appointments.total,
        percentage: data.appointments.percentage,
        valueElId: 'appointments-stat-value',
        percentageElId: 'appointments-percentage',
        themeColor: 'var(--login-primary-accent)'
    });

    const clientsChartData = groupDataForChart(data.clients.data, data.period, 'created_at', 'count');
    ReportCharts.renderChart({
        chartId: 'clients-area-chart',
        series: clientsChartData.series,
        categories: clientsChartData.categories,
        total: data.clients.total,
        percentage: data.clients.percentage,
        valueElId: 'clients-stat-value',
        percentageElId: 'clients-percentage',
        themeColor: '#3B82F6'
    });
}

function renderTransactionList(appointmentsToRender) {
    const listEl = document.getElementById('transaction-list');
    if (!listEl) return;

    if (!appointmentsToRender || appointmentsToRender.length === 0) {
        listEl.innerHTML = '<p class="no-transactions" style="text-align: center; padding: 20px; color: var(--secondary-text-color);">No se encontraron transacciones con los filtros actuales.</p>';
        return;
    }

    appointmentsToRender.sort((a, b) => new Date(b.fecha_cita + 'T' + b.hora_inicio_cita) - new Date(a.fecha_cita + 'T' + a.hora_inicio_cita));

    const getServiceName = (booking) => {
        const serviceInfo = booking.barbero_servicios;
        return serviceInfo?.nombre_personalizado || serviceInfo?.servicios_maestro?.nombre || 'Servicio no especificado';
    };

    listEl.innerHTML = appointmentsToRender.map(item => {
        const isDebt = item.estado_pago === 'pendiente' || (item.estado === 'pendiente' && item.estado_pago !== 'pagado');
        
        const amountDisplay = isDebt 
            ? `- $${(item.precio_final || 0).toFixed(2)}`
            : `+ $${(item.precio_final || 0).toFixed(2)}`;

        const itemClass = isDebt ? 'transaction-item is-debt' : 'transaction-item';

        const actionHtml = isDebt 
            ? `<div class="align-right"><button class="cancel-debt-btn" data-cita='${JSON.stringify(item)}'>Registrar Pago</button></div>`
            : `<div class="align-right">${item.estado_pago === 'pagado' ? 'Pagado' : '--'}</div>`;

        return `
            <div class="${itemClass}">
                <span>${new Date(item.fecha_cita + 'T00:00:00').toLocaleDateString('es-ES')}</span>
                <span>${item.cliente_nombre || 'N/A'}</span>
                <span class="service-name">${getServiceName(item)}</span>
                <span class="align-right amount-value">${amountDisplay}</span>
                ${actionHtml} 
            </div>
        `;
    }).join('');
}

/**
 * Filters the currently stored transaction list based on search and debt toggle, then re-renders the list.
 */
function filterAndRenderTransactions() {
    const searchInput = document.getElementById('transaction-search-input');
    const debtButton = document.getElementById('toggle-debt-btn');
    
    if (!searchInput || !debtButton) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const showOnlyDebts = debtButton.classList.contains('active');

    let filteredList = [...currentPeriodAppointments]; // Start with the full list for the period

    // 1. Filter by search term (if any)
    if (searchTerm) {
        filteredList = filteredList.filter(item => 
            item.cliente_nombre && item.cliente_nombre.toLowerCase().includes(searchTerm)
        );
    }

    // 2. Filter by debt status (if toggle is active)
    if (showOnlyDebts) {
        filteredList = filteredList.filter(item => {
            // The same logic used in renderTransactionList to determine debt
            return item.estado_pago === 'pendiente' || (item.estado === 'pendiente' && item.estado_pago !== 'pagado');
        });
    }
    
    // 3. Re-render the list with the filtered results
    renderTransactionList(filteredList);
}

function initCalendar() {
    if (calPrevMonthBtn) calPrevMonthBtn.addEventListener('click', () => changeMonth(-1));
    if (calNextMonthBtn) calNextMonthBtn.addEventListener('click', () => changeMonth(1));
    fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
}

async function fetchBookingsForMonth(year, month) {
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const { data, error } = await supabaseClient.from('citas').select('fecha_cita').eq('barbero_id', currentUserId).gte('fecha_cita', firstDay).lte('fecha_cita', lastDay);
    if (error) { console.error("Error cargando reservas del mes:", error); return; }
    monthlyBookingsMap.clear();
    data.forEach(booking => monthlyBookingsMap.set(booking.fecha_cita, true));
    renderCalendar(year, month);
}

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
}

function renderCalendar(year, month) {
    if (!calendarDaysGrid || !calCurrentMonthYear) return;
    calendarDaysGrid.innerHTML = '';
    calCurrentMonthYear.textContent = `${monthsOfYear[month]} ${year}`;
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay();
    let currentWeekRow = document.createElement('div');
    currentWeekRow.className = 'calendar-week-row';
    for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeekRow.innerHTML += '<span class="calendar-day other-month"></span>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
        if ((firstDayOfWeek + day - 1) % 7 === 0 && currentWeekRow.children.length > 0) {
            calendarDaysGrid.appendChild(currentWeekRow);
            currentWeekRow = document.createElement('div');
            currentWeekRow.className = 'calendar-week-row';
        }
        const daySpan = document.createElement('span');
        daySpan.className = 'calendar-day';
        daySpan.textContent = day;
        const currentDateObj = new Date(year, month, day);
        const dateString = currentDateObj.toISOString().split('T')[0];
        daySpan.dataset.date = dateString;
        daySpan.dataset.dayOfWeek = currentDateObj.getDay();
        const today = new Date();
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            daySpan.classList.add('today');
        }
        if (monthlyBookingsMap.has(dateString)) {
            daySpan.classList.add('has-bookings');
        }
        daySpan.addEventListener('click', (e) => handleCalendarDayClick(e.target, dateString, currentDateObj.getDay()));
        currentWeekRow.appendChild(daySpan);
    }
    const remainingCells = 7 - (currentWeekRow.children.length % 7);
    if (currentWeekRow.children.length > 0 && remainingCells < 7) {
          for (let i = 0; i < remainingCells; i++) {
            const emptySpan = document.createElement('span');
            emptySpan.className = 'calendar-day other-month';
            currentWeekRow.appendChild(emptySpan);
        }
    }
    if (currentWeekRow.children.length > 0) {
        calendarDaysGrid.appendChild(currentWeekRow); // APPEND THE FINAL ROW
    }
}

// REEMPLAZA ESTA FUNCIÓN COMPLETA

function handleCalendarDayClick(dayElement, dateString, dayOfWeekIndex) {
    // Marcamos visualmente el día seleccionado en el calendario
    document.querySelectorAll('.calendar-day.selected-day').forEach(d => d.classList.remove('selected-day'));
    dayElement.classList.add('selected-day');

    // Almacenamos el día activo para la lógica de guardado de horarios (si se usa)
    activeEditingDayIndex = dayOfWeekIndex;

    // Mostramos el nuevo modal de acciones
    showCalendarActionModal(dateString, dayOfWeekIndex);
}
async function loadAndRenderBookingsForDate(dateString) {
    if (selectedDayHeading) selectedDayHeading.textContent = new Date(dateString + 'T12:00:00').toLocaleDateString('es-ES', { dateStyle: 'full' });
    if (bookingsList) bookingsList.innerHTML = 'Cargando citas...';
    const { data, error } = await supabaseClient.from('citas').select('*, barbero_servicios(*, servicios_maestro(*))').eq('barbero_id', currentUserId).eq('fecha_cita', dateString).order('hora_inicio_cita');
    if (error) {
        console.error("Error cargando citas del día:", error);
        if (bookingsList) bookingsList.innerHTML = `<p style="color:var(--danger-color)">Error al cargar las citas.</p>`;
        return;
    }
    renderBookingsForDay(data);
}

function renderBookingsForDay(bookings) {
    if (!bookingsList) return;
    if (bookings.length === 0) {
        bookingsList.innerHTML = '<p>No hay citas programadas para este día.</p>';
        return;
    }
    let html = '';
    bookings.forEach(booking => {
        const serviceInfo = booking.barbero_servicios;
        const serviceName = serviceInfo?.nombre_personalizado || serviceInfo?.servicios_maestro?.nombre || 'Servicio no especificado';
        html += `<div class="booking-item"><h4>${booking.hora_inicio_cita.substring(0,5)} - ${booking.hora_fin_cita.substring(0,5)}</h4><p><strong>Cliente:</strong> ${booking.cliente_nombre}</p><p><strong>Teléfono:</strong> ${booking.cliente_telefono || 'No provisto'}</p><p><strong>Servicio:</strong> ${serviceName}</p><p><strong>Estado:</strong> <span style="text-transform: capitalize;">${booking.estado}</span></p></div>`;
    });
    bookingsList.innerHTML = html;
}

function renderBarberForm(barberData) {
    if (!profileContent) return;
    profileContent.innerHTML = `<form id="barber-profile-form"><div class="input-group"><i class="fas fa-user"></i><input type="text" id="barber-name" value="${barberData?.nombre || ''}" placeholder=" " required><label for="barber-name">Nombre Completo</label></div><div class="input-group"><i class="fas fa-phone"></i><input type="tel" id="barber-phone" value="${barberData?.telefono || ''}" placeholder=" " required><label for="barber-phone">Teléfono (ej: 58412...)</label></div><div class="input-group"><i class="fas fa-image"></i><input type="file" id="barber-photo" accept="image/*"><label for="barber-photo" style="top:-10px;left:10px;font-size:0.85em;background:var(--login-card-bg);padding:0 5px;z-index:2;">Foto (opcional)</label></div><img src="${barberData?.foto_perfil_url || ''}" alt="Foto de perfil" id="current-profile-img" class="profile-img-preview" style="${barberData?.foto_perfil_url ? 'display:block;' : 'display:none;'}"></form>`;
    const photoInput = document.getElementById('barber-photo');
    if (photoInput) {
        photoInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            const imgPreview = document.getElementById('current-profile-img');
            if (file && imgPreview) {
                const reader = new FileReader();
                reader.onload = (e) => { imgPreview.src = e.target.result; imgPreview.style.display = 'block'; };
                reader.readAsDataURL(file);
            }
        });
    }
}

function renderServices(barberServices) {
    if (!servicesSection) return;
    let html = '<h3>Servicios Estándar</h3>';
    if (!masterServices || masterServices.length === 0) {
        html += '<p>No hay servicios estándar definidos.</p>';
    } else {
        masterServices.forEach(ms => {
            const existingService = barberServices.find(bs => bs.servicio_id === ms.id);
            const isChecked = !!existingService;
            const price = existingService?.precio ?? '';
            const duration = existingService?.duracion_minutos ?? 30;

            html += `<div class="service-item">
                        <input type="checkbox" id="service-${ms.id}" data-id="${ms.id}" ${isChecked ? 'checked' : ''}>
                        <label for="service-${ms.id}">${ms.nombre}</label>
                        <div class="service-inputs" style="display: flex; gap: 10px;">
                            <input type="number" class="service-price-input" placeholder="Precio" id="price-for-service-${ms.id}" value="${price}" step="0.50" min="0" ${isChecked ? '' : 'disabled'} data-price-for="${ms.id}" style="width: 90px;">
                            <input type="number" class="service-duration-input" placeholder="Min" id="duration-for-service-${ms.id}" value="${duration}" step="5" min="5" ${isChecked ? '' : 'disabled'} data-duration-for="${ms.id}" style="width: 80px;">
                        </div>
                     </div>`;
        });
    }
    html += '<h3 style="margin-top:20px;">Mis Servicios Personalizados</h3>';
    const customServices = barberServices.filter(bs => bs.nombre_personalizado);
    if (customServices.length === 0) {
        html += '<p>No has añadido servicios personalizados.</p>';
    } else {
        customServices.forEach(bs => {
            html += `<div class="service-item" data-custom-id="${bs.id}">
                        <span>${bs.nombre_personalizado} - $${bs.precio} (${bs.duracion_minutos || 30} min)</span>
                        <button class="remove-custom-service" data-id="${bs.id}">X</button>
                    </div>`;
        });
    }
    servicesSection.innerHTML = html;
    
    servicesSection.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const serviceId = e.target.dataset.id;
            const priceInput = servicesSection.querySelector(`input[data-price-for="${serviceId}"]`);
            const durationInput = servicesSection.querySelector(`input[data-duration-for="${serviceId}"]`);
            if (priceInput && durationInput) {
                const isEnabled = e.target.checked;
                priceInput.disabled = !isEnabled;
                durationInput.disabled = !isEnabled;
                if (!isEnabled) {
                    priceInput.value = '';
                    durationInput.value = '30';
                }
            }
        });
    });

    servicesSection.querySelectorAll('.remove-custom-service').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const serviceId = e.target.dataset.id;
            if (confirm('¿Seguro que quieres eliminar este servicio personalizado?')) {
                if (saveStatus) saveStatus.textContent = 'Eliminando...';
                const { error } = await supabaseClient.from('barbero_servicios').delete().eq('id', serviceId);
                if (error) { alert('Error al eliminar: ' + error.message); if (saveStatus) saveStatus.textContent = 'Error.'; }
                else {
                    if (saveStatus) saveStatus.textContent = 'Eliminado.';
                    const { data, error: errLoad } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
                    if (errLoad) console.error("Error recargando servicios:", errLoad);
                    else renderServices(data || []);
                    setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 2000);
                }
            }
        });
    });
}

function renderBookingLink(userId) {
    if (bookingLinkContainer && userId) {
        const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const bookingUrl = `${baseUrl}/reserva.html?barber_id=${userId}`;
        bookingLinkContainer.innerHTML = `<a href="${bookingUrl}" target="_blank">${bookingUrl}</a><br><br><button id="copy-link-btn" class="profile-action-btn" style="width:auto;padding:8px 15px;font-size:0.9em;"><i class="fas fa-copy"></i> Copiar Enlace</button>`;
        document.getElementById('copy-link-btn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(bookingUrl).then(() => alert('¡Enlace copiado!')).catch(err => alert('Error al copiar.'));
        });
    }
}

function renderSlotInput(id, start, end) {
    const startTime = start ? start.substring(0, 5) : '09:00';
    const endTime = end ? end.substring(0, 5) : '17:00';
    return `<div class="time-slot" data-slot-id="${id || 'new'}"><input type="time" value="${startTime}"><span> - </span><input type="time" value="${endTime}"><button class="remove-slot-btn" data-id="${id || 'new'}">X</button></div>`;
}

function displayAvailabilityForDay(dayIndex) {
    if (!selectedDaySlotsContainer) return;
    selectedDaySlotsContainer.innerHTML = '';
    const slotsForDay = weeklyAvailabilityData[dayIndex] || [];
    if (slotsForDay.length === 0) {
        selectedDaySlotsContainer.innerHTML = '<p style="text-align:center;opacity:0.7;">No hay horarios definidos para este día.</p>';
    } else {
        slotsForDay.forEach(slot => { selectedDaySlotsContainer.innerHTML += renderSlotInput(slot.id, slot.hora_inicio, slot.hora_fin); });
    }
}

function handleAddSlotToSelectedDay() {
    if (activeEditingDayIndex === -1 || !selectedDaySlotsContainer) { alert("Por favor, selecciona un día en el calendario primero."); return; }
    const newSlotHtml = renderSlotInput(null, '09:00', '17:00');
    selectedDaySlotsContainer.insertAdjacentHTML('beforeend', newSlotHtml);
    selectedDaySlotsContainer.querySelector('p')?.remove();
    updateInMemoryAvailabilityFromUI();
}

function updateInMemoryAvailabilityFromUI() {
    if (activeEditingDayIndex === -1 || !selectedDaySlotsContainer) return;
    const currentDaySlots = [];
    selectedDaySlotsContainer.querySelectorAll('.time-slot').forEach(slotDiv => {
        const inputs = slotDiv.querySelectorAll('input[type="time"]');
        const start = inputs[0].value;
        const end = inputs[1].value;
        const slotDbId = slotDiv.dataset.slotId !== 'new' ? parseInt(slotDiv.dataset.slotId, 10) : null;
        if (start && end) currentDaySlots.push({ id: slotDbId, hora_inicio: start, hora_fin: end });
    });
    weeklyAvailabilityData[activeEditingDayIndex] = currentDaySlots;
}

function navigateToDateFromNotification(dateString) {
    if (!dateString) return;
    const reservasLink = document.querySelector('.menu-link[data-target="reservas"]');
    if (reservasLink && !reservasLink.classList.contains('active')) {
        reservasLink.click();
    }
    const targetDate = new Date(dateString + 'T12:00:00');
    const isSameMonthView = targetDate.getFullYear() === currentCalendarDate.getFullYear() && targetDate.getMonth() === currentCalendarDate.getMonth();
    currentCalendarDate = targetDate;
    const findAndClickDay = () => {
        setTimeout(() => {
            const dayElement = document.querySelector(`.calendar-day[data-date="${dateString}"]`);
            if (dayElement) {
                dayElement.click();
                dayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);
    };
    if (!isSameMonthView) {
        fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth()).finally(findAndClickDay);
    } else {
        findAndClickDay();
    }
}

function setupEventListeners() {
    if (logoutProfileButton) logoutProfileButton.addEventListener('click', logout);
    if (saveAllButton) saveAllButton.addEventListener('click', saveAllChanges);
    if (addOtherServiceButton) addOtherServiceButton.addEventListener('click', addOtherService);
    if (addSlotToSelectedDayBtn) addSlotToSelectedDayBtn.addEventListener('click', handleAddSlotToSelectedDay);
    
    if (selectedDaySlotsContainer) {
        selectedDaySlotsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-slot-btn')) {
                e.target.closest('.time-slot')?.remove();
                updateInMemoryAvailabilityFromUI();
                if (selectedDaySlotsContainer.children.length === 0) {
                    selectedDaySlotsContainer.innerHTML = '<p style="text-align:center;opacity:0.7;">No hay horarios definidos.</p>';
                }
            }
        });
        selectedDaySlotsContainer.addEventListener('change', (e) => {
            if (e.target.matches('input[type="time"]')) {
                updateInMemoryAvailabilityFromUI();
            }
        });
    }

    const reportesSection = document.getElementById('reportes');
    if (reportesSection) {
        reportesSection.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('cancel-debt-btn')) {
                e.preventDefault(); 
                const citaDataString = e.target.dataset.cita;
                if (citaDataString) {
                    try {
                        const cita = JSON.parse(citaDataString);
                        showPaymentModal(cita);
                    } catch (jsonError) {
                        console.error("Error al parsear los datos de la cita desde el botón:", jsonError);
                        alert("Hubo un error al intentar procesar esta deuda.");
                    }
                }
            }
        });
    }

    // Listeners for transaction filtering
    const searchInput = document.getElementById('transaction-search-input');
    const debtButton = document.getElementById('toggle-debt-btn');

    if (searchInput) {
        searchInput.addEventListener('input', filterAndRenderTransactions);
    }

    if (debtButton) {
        debtButton.addEventListener('click', () => {
            debtButton.classList.toggle('active');
            filterAndRenderTransactions();
        });
    }
}

// =================================================================
// ===== INICIO: LÓGICA PARA EL NUEVO MODAL DE ACCIONES DEL CALENDARIO =====
// =================================================================

let currentActionModalDate = { dateString: null, dayOfWeek: null };

/**
 * Configura los listeners para el nuevo modal de acciones del calendario.
 */
function setupCalendarActionModal() {
    const overlay = document.getElementById('calendar-action-modal-overlay');
    const closeBtn = document.getElementById('calendar-action-modal-close-btn');
    const viewBookingsBtn = document.getElementById('modal-view-bookings-btn');
    const editAvailabilityBtn = document.getElementById('modal-edit-availability-btn');
    const backBtn = document.getElementById('modal-back-btn');

    const modal = document.getElementById('calendar-action-modal');
    if (!overlay || !modal) return;

    const closeModal = () => closeCalendarActionModal();
    
    // Listeners para cerrar el modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    closeBtn.addEventListener('click', closeModal);

    // Listener para el botón "Ver Citas"
    viewBookingsBtn.addEventListener('click', () => {
        document.getElementById('modal-action-buttons-view').style.display = 'none';
        document.getElementById('modal-content-view').style.display = 'block';
        const viewer = document.querySelector('.modal-content-viewer[data-viewer="bookings"]');
        viewer.classList.add('active');
        loadAndRenderBookingsForDate(currentActionModalDate.dateString);
    });

    // Listener para el botón "Editar Horarios"
    editAvailabilityBtn.addEventListener('click', () => {
        document.getElementById('modal-action-buttons-view').style.display = 'none';
        document.getElementById('modal-content-view').style.display = 'block';
        const viewer = document.querySelector('.modal-content-viewer[data-viewer="availability"]');
        viewer.classList.add('active');
        displayAvailabilityForDay(currentActionModalDate.dayOfWeek);
    });
    
    // Listener para el botón "Volver"
    backBtn.addEventListener('click', () => {
        document.getElementById('modal-content-view').style.display = 'none';
        document.querySelector('.modal-content-viewer.active')?.classList.remove('active');
        document.getElementById('modal-action-buttons-view').style.display = 'block';
    });
}


/**
 * Muestra el modal de acciones para un día específico.
 * @param {string} dateString - La fecha en formato YYYY-MM-DD.
 * @param {number} dayOfWeek - El índice del día de la semana (0=Domingo).
 */
function showCalendarActionModal(dateString, dayOfWeek) {
    currentActionModalDate = { dateString, dayOfWeek };
    
    const overlay = document.getElementById('calendar-action-modal-overlay');
    const dateText = document.getElementById('modal-selected-date-text');
    
    // Formatear la fecha para mostrarla amigablemente
    const friendlyDate = new Date(dateString + 'T12:00:00').toLocaleDateString('es-ES', { dateStyle: 'long' });
    dateText.textContent = friendlyDate;

    // Resetear la vista del modal
    document.getElementById('modal-action-buttons-view').style.display = 'block';
    document.getElementById('modal-content-view').style.display = 'none';
    document.querySelectorAll('.modal-content-viewer').forEach(v => v.classList.remove('active'));

    // Limpiar contenido anterior
    document.getElementById('bookings-list').innerHTML = '';
    document.getElementById('selected-day-slots-container').innerHTML = '';

    overlay.classList.add('active');
}

/**
 * Cierra y resetea el modal de acciones del calendario.
 */
function closeCalendarActionModal() {
    const overlay = document.getElementById('calendar-action-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}
// ===== FIN: LÓGICA PARA EL NUEVO MODAL DE ACCIONES =====

async function addOtherService() {
    const nameInput = document.getElementById('other-service-name');
    const priceInput = document.getElementById('other-service-price');
    const durationInput = document.getElementById('other-service-duration');

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);
    const duration = parseInt(durationInput.value, 10);

    if (!name || isNaN(price) || price <= 0 || isNaN(duration) || duration <= 0) {
        alert('Por favor, introduce un nombre, precio y duración válidos.');
        return;
    }
    
    if (saveStatus) saveStatus.textContent = 'Añadiendo...';

    const { error } = await supabaseClient.from('barbero_servicios').insert({
        barbero_id: currentUserId,
        servicio_id: null,
        precio: price,
        nombre_personalizado: name,
        duracion_minutos: duration
    });

    if (error) {
        alert('Error al añadir servicio: ' + error.message);
        if (saveStatus) saveStatus.textContent = 'Error.';
    } else {
        if (saveStatus) saveStatus.textContent = 'Servicio añadido.';
        nameInput.value = '';
        priceInput.value = '';
        durationInput.value = '30';
        
        const { data, error: errLoad } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
        if (errLoad) console.error("Error recargando servicios:", errLoad);
        else renderServices(data || []);
        setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 2000);
    }
}

async function logout() {
    if (saveStatus) saveStatus.textContent = 'Cerrando sesión...';
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Error al cerrar sesión:', error);
        if (saveStatus) saveStatus.textContent = `Error: ${error.message}`;
    }
}

async function saveAllChanges() {
    if (saveStatus) saveStatus.textContent = "Guardando...";
    if (saveAllButton) saveAllButton.disabled = true;
    try {
        await saveBasicProfile();
        await saveServices();
        await saveAvailability();
        if (saveStatus) saveStatus.textContent = "¡Todos los cambios guardados con éxito! ✅";
        if (activeEditingDayIndex !== -1) displayAvailabilityForDay(activeEditingDayIndex);
        setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 3000);
    } catch (error) {
        console.error("Error al guardar todo:", error);
        if (saveStatus) saveStatus.textContent = `Error: ${error.message}`;
    } finally {
        if (saveAllButton) saveAllButton.disabled = false;
    }
}

async function saveBasicProfile() {
    const nombre = document.getElementById('barber-name').value;
    const telefono = document.getElementById('barber-phone').value;
    const fotoFile = document.getElementById('barber-photo').files[0];
    let foto_perfil_url = document.getElementById('current-profile-img').src;
    if (!nombre.trim() || !telefono.trim()) throw new Error("El nombre y el teléfono no pueden estar vacíos.");
    if (fotoFile) {
        const compressedFile = await imageCompression(fotoFile, { maxSizeMB: 0.5, maxWidthOrHeight: 800 });
        const filePath = `${currentUserId}/${Date.now()}_${compressedFile.name}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage.from('barber-photos').upload(filePath, compressedFile, { upsert: true });
        if (uploadError) throw new Error(`Subida Foto: ${uploadError.message}`);
        foto_perfil_url = supabaseClient.storage.from('barber-photos').getPublicUrl(uploadData.path).data.publicUrl;
    }
    const { error } = await supabaseClient.from('barberos').update({ nombre, telefono, foto_perfil_url }).eq('user_id', currentUserId);
    if (error) throw new Error(`Perfil Básico: ${error.message}`);
}

async function saveServices() {
    const servicesToUpsert = [];
    const serviceIdsToKeep = [];
    let errorThrown = false; 

    servicesSection.querySelectorAll('input[type="checkbox"][data-id]').forEach(cb => {
        if (errorThrown) return;
        
        const serviceId = cb.dataset.id;
        if (cb.checked) {
            const price = parseFloat(servicesSection.querySelector(`input[data-price-for="${serviceId}"]`).value);
            const duration = parseInt(servicesSection.querySelector(`input[data-duration-for="${serviceId}"]`).value, 10);
            
            if (!isNaN(price) && price >= 0 && !isNaN(duration) && duration > 0) {
                servicesToUpsert.push({
                    barbero_id: currentUserId,
                    servicio_id: serviceId,
                    precio: price,
                    duracion_minutos: duration
                });
                serviceIdsToKeep.push(serviceId);
            } else {
                errorThrown = true;
                throw new Error(`Datos inválidos para el servicio "${cb.nextElementSibling.textContent}". Revisa el precio y la duración.`);
            }
        }
    });
    
    const { error: deleteError } = await supabaseClient
        .from('barbero_servicios')
        .delete()
        .eq('barbero_id', currentUserId)
        .not('servicio_id', 'is', null)
        .not('servicio_id', 'in', `(${serviceIdsToKeep.join(',') || "''"})`);
    
    if (deleteError) throw new Error(`Error actualizando servicios (borrado): ${deleteError.message}`);

    if (servicesToUpsert.length > 0) {
        const { error: upsertError } = await supabaseClient
            .from('barbero_servicios')
            .upsert(servicesToUpsert, { onConflict: 'barbero_id, servicio_id' });
        
        if (upsertError) throw new Error(`Error guardando servicios (upsert): ${upsertError.message}`);
    }
}




async function saveAvailability() {
    updateInMemoryAvailabilityFromUI();
    const slotsToInsert = [];
    let validationErrorMsg = null;
    weeklyAvailabilityData.forEach((daySlots, dayIndex) => {
        daySlots.forEach(slot => {
            if (validationErrorMsg) return;
            if (slot.hora_inicio && slot.hora_fin) {
                if (slot.hora_inicio >= slot.hora_fin) {
                    validationErrorMsg = `Horario inválido para ${daysOfWeek[dayIndex]}: la hora de inicio debe ser anterior a la de fin.`;
                }
                slotsToInsert.push({ barbero_id: currentUserId, dia_semana: dayIndex, hora_inicio: slot.hora_inicio, hora_fin: slot.hora_fin });
            }
        });
    });
    if (validationErrorMsg) throw new Error(validationErrorMsg);
    const { error: deleteError } = await supabaseClient.from('disponibilidad').delete().eq('barbero_id', currentUserId);
    if (deleteError) throw new Error(`Disponibilidad (borrado): ${deleteError.message}`);
    if (slotsToInsert.length > 0) {
        const { error: insertError } = await supabaseClient.from('disponibilidad').insert(slotsToInsert);
        if (insertError) throw new Error(`Disponibilidad (insertado): ${insertError.message}`);
    }
}


// --- INICIAR ---
document.addEventListener('DOMContentLoaded', initProfileModule);


// MEJORA: Listener para refrescar datos después de que un pago es procesado por el modal.
document.addEventListener('paymentProcessed', (e) => {
    console.log(`Pago procesado para la cita ${e.detail.citaId}. Refrescando datos...`);
    if (saveStatus) {
        saveStatus.textContent = "Pago registrado y cita finalizada con éxito. ✅";
        setTimeout(() => { if(saveStatus) saveStatus.textContent = "" }, 4000);
    }

    // Dispara el evento que ya usan los reportes y el dashboard para actualizarse
    document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
    
    // --- INICIO DE LA MEJORA ---
    // Dispara el evento para que la lista de clientes también se refresque.
    // Esto cambiará la tarjeta del cliente de rojo (con deuda) a normal.
    document.dispatchEvent(new CustomEvent('clientListChanged'));
    // --- FIN DE LA MEJORA ---

    // Refresca la vista del calendario
    fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
    const selectedDay = document.querySelector('.calendar-day.selected-day');
    if (selectedDay) {
        loadAndRenderBookingsForDate(selectedDay.dataset.date);
    }
});
