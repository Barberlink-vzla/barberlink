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
let currentBarberProfileId = null; // <-- AÑADIR ESTA LÍNEA
let masterServices = [];
let barberServicesData = []; // NUEVA VARIABLE GLOBAL PARA GUARDAR SERVICIOS
let barberClients = []
let currentPeriodAppointments = []; // Holds the full, unfiltered list of appointments for the current report period
let currentBarberName = '';


// Variables globales para el calendario y la disponibilidad

let highlightedCitaId = null; // Guardará el ID de la cita a resaltar
let currentCalendarDate = new Date();
let weeklyAvailabilityData = [[], [], [], [], [], [], []];
let activeEditingDayIndex = -1;
let monthlyBookingsMap = new Map();

// Variables para recordatorios y confirmaciones

let confirmationCheckInterval = null; 
let paymentCheckInterval = null; 
const promptedConfirmationIds = new Set(); 
let reminderCheckInterval = null;
const remindedAppointmentIds = new Set();
let appointmentCheckInterval = null; // Intervalo para verificar citas próximas
const notifiedAppointmentIds = new Set(); // Guarda IDs de citas ya notificadas para no repetir

const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const monthsOfYear = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];


// EN: js/barberProfile.js (Pega esto cerca del inicio)

const currencyManager = {
    rate: 0,
    markup: 0,
    finalRate: 0,
    primaryCurrency: 'USD',
    secondaryCurrency: 'VES',

    /**
     * Inicializa el gestor, obtiene la tasa de cambio y el markup del barbero.
     */
    async init(supabaseClient, barberProfile) {
        this.markup = barberProfile.porcentaje_markup_tasa || 0;
        this.primaryCurrency = barberProfile.moneda_primaria || 'USD';
        this.secondaryCurrency = barberProfile.moneda_secundaria || 'VES';

        try {
            const { data, error } = await supabaseClient.functions.invoke('get-bcv-rate');
            if (error) throw error;
            this.rate = data.rate || 0;
            this.finalRate = this.rate * (1 + this.markup / 100);
            console.log(`Tasas cargadas: BCV=${this.rate}, Markup=${this.markup}%, Final=${this.finalRate.toFixed(2)}`);
        } catch (error) {
            console.error("Error al obtener la tasa de cambio:", error);
            // Fallback por si la API falla
            this.rate = 0;
            this.finalRate = 0;
        }
    },

    /**
     * Formatea un precio en USD a un string con ambas monedas.
     * @param {number} usdAmount - La cantidad en USD.
     * @returns {string} - El precio formateado, ej: "$10.00 (Bs. 365.25)"
     */
    formatPrice(usdAmount) {
        if (typeof usdAmount !== 'number') {
            usdAmount = 0;
        }
        
        const primaryFormatted = `${this.primaryCurrency} ${usdAmount.toFixed(2)}`;
        
        if (this.finalRate > 0) {
            const secondaryAmount = usdAmount * this.finalRate;
            const secondaryFormatted = `${this.secondaryCurrency} ${secondaryAmount.toFixed(2)}`;
            return `${primaryFormatted} (${secondaryFormatted})`;
        }
        
        return primaryFormatted; // Si no hay tasa, muestra solo USD
    },

    /**
     * Devuelve solo el valor en la moneda secundaria (Bolívares).
     * @param {number} usdAmount - La cantidad en USD.
     * @returns {string} - El precio formateado en la moneda secundaria.
     */
    getSecondaryValueText(usdAmount) {
        if (typeof usdAmount !== 'number' || this.finalRate <= 0) {
            return `${this.secondaryCurrency} 0.00`;
        }
        const secondaryAmount = usdAmount * this.finalRate;
        return `${this.secondaryCurrency} ${secondaryAmount.toFixed(2)}`;
    }
};

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

// --- NUEVOS ELEMENTOS DEL DOM PARA EL MODAL DE RECORDATORIO ---
const reminderOverlay = document.getElementById('reminder-modal-overlay');
const reminderClientName = document.getElementById('reminder-client-name');
const reminderTime = document.getElementById('reminder-time');
const reminderCloseBtn = document.getElementById('reminder-modal-close-btn');
// Elementos del modal de confirmación
const confirmationOverlay = document.getElementById('confirmation-modal-overlay');
const confirmationModal = document.getElementById('confirmation-modal');
const confirmationText = document.getElementById('confirmation-modal-text');
const confirmArrivalBtn = document.getElementById('confirm-arrival-btn');
const confirmNoshowBtn = document.getElementById('confirm-noshow-btn');
const confirmationCloseBtn = document.getElementById('confirmation-modal-close-btn');

const appLoader = document.getElementById('app-loader'); // <-- AÑADIR ESTA LÍNEA


// --- INICIO: Elementos del DOM para el nuevo modal de Visita Inmediata ---
const showWalkInModalBtn = document.getElementById('show-walk-in-modal-btn');
const walkInModalOverlay = document.getElementById('walk-in-modal-overlay');
const walkInModal = document.getElementById('walk-in-modal');
const walkInCloseBtn = document.getElementById('walk-in-modal-close-btn');
const walkInForm = document.getElementById('walk-in-form');
const walkInServiceSelect = document.getElementById('walk-in-service-select');
const walkInStatus = document.getElementById('walk-in-status');
// --- FIN: Elementos del DOM para el nuevo modal ---


// js/barberProfile.js

// ... (después de las otras variables del DOM)
const deleteHistoryBtn = document.getElementById('delete-history-btn');
const passwordConfirmOverlay = document.getElementById('password-confirm-modal-overlay');
const passwordConfirmCloseBtn = document.getElementById('password-confirm-close-btn');
const passwordConfirmActionBtn = document.getElementById('password-confirm-action-btn');
const passwordConfirmInput = document.getElementById('password-confirm-input');
const passwordConfirmStatus = document.getElementById('password-confirm-status');


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
        setupReminderModalListeners(); // <-- AÑADIR ESTA LÍNEA
        setupAlertModalListeners(); // <-- AÑADIR ESTA LÍNEA
        
        setupPasswordConfirmModalListeners(); // <-- ¡AÑADE ESTA LÍNEA AQUÍ!


   
startAppointmentChecker();// <-- ¡ESTA ES LA CORRECCIÓN CLAVE!


    await loadInitialData();
    
    
     // --- LÓGICA DE CARGA MEJORADA ---
    const appLoader = document.getElementById('app-loader');
    
    if (appLoader) {
        // 1. Oculta el loader
        appLoader.classList.add('hidden');
    }
    
    // 2. Muestra el contenido principal del dashboard
    document.body.classList.add('loaded');
    // --- FIN DE LA MEJORA ---
    
     handlePushNotificationRedirect();
       // ¡AQUÍ ES DONDE AÑADES LA LÍNEA!
    handleUrlParameters();
    

 
 
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
        // --- MEJORA ---
        // Guardamos el ID de la cita que viene desde la notificación
        highlightedCitaId = e.detail.citaId || null; 
        
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

    setupPushNotificationButton();
    registerServiceWorker();
    startConfirmationChecker();
    

    await fetchBarberClients();

    if (saveStatus) saveStatus.textContent = "Cargando datos...";
    try {
        const { data: barberProfile, error: barberError } = await 
        supabaseClient
            .from('barberos')
            .select('id, nombre, telefono, foto_perfil_url, porcentaje_markup_tasa')
            .eq('user_id', currentUserId)
            .single();

        if (barberError || !barberProfile) {
            console.error('Error crítico: No se encontró el perfil de barbero para el usuario autenticado.', barberError);
            if (saveStatus) saveStatus.textContent = "Error: Perfil de barbero no encontrado.";
            return;
        }

        currentBarberProfileId = barberProfile.id;
        await currencyManager.init(supabaseClient, barberProfile);

        console.log(`✅ IDs recuperados: Auth User ID -> ${currentUserId}, Barber Profile ID -> ${currentBarberProfileId}`);

        // ================== INICIO DE LA CORRECCIÓN ==================
        // Usamos currentUserId para cargar servicios y disponibilidad, ya que así se guardan.
        const [masterServicesRes, barberServicesRes, availabilityRes] = await Promise.all([
            supabaseClient.from('servicios_maestro').select('*').order('nombre'),
            supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId), // <-- ¡CORREGIDO!
            supabaseClient.from('disponibilidad').select('*').eq('barbero_id', currentUserId).order('dia_semana').order('hora_inicio') // <-- ¡CORREGIDO!
        ]);
        // =================== FIN DE LA CORRECCIÓN ====================

        if (masterServicesRes.error) throw new Error(`Servicios Maestros: ${masterServicesRes.error.message}`);
        if (barberServicesRes.error) throw new Error(`Servicios Barbero: ${barberServicesRes.error.message}`);
        if (availabilityRes.error) throw new Error(`Disponibilidad: ${availabilityRes.error.message}`);

        masterServices = masterServicesRes.data || [];
        barberServicesData = barberServicesRes.data || [];

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

        renderBarberForm(barberProfile); 
        renderServices(barberServicesRes.data);
        renderBookingLink(currentUserId); 
        
         // ¡Movemos el bloque aquí, dentro del 'try' donde 'barberProfile' sí existe!
        const markupInput = document.getElementById('tasa-markup');
        if (markupInput && barberProfile.porcentaje_markup_tasa != null) {
            markupInput.value = barberProfile.porcentaje_markup_tasa;
        }
        
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

/**
 * Cierra el modal de visita inmediata y resetea el formulario.
 */
function closeWalkInModal() {
    if (walkInModalOverlay) {
        walkInModalOverlay.classList.remove('active');
    }

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


/**
 * Maneja el envío del formulario de visita inmediata.
 * Crea el cliente (si es nuevo), crea la cita y la deja "en proceso".
 * El modal de pago se mostrará automáticamente cuando el servicio termine.
 */
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
            estado: APPOINTMENT_STATUS.IN_PROGRESS, // Se marca como "en proceso" directamente
            metodo_pago: null,
            estado_pago: 'pendiente',
            monto: serviceData.precio
        };

        const { data: insertedCita, error: citaError } = await supabaseClient
            .from('citas')
            .insert(newCita)
            .select()
            .single();

        if (citaError) throw new Error(`Error al crear la cita: ${citaError.message}`);

        promptedConfirmationIds.add(insertedCita.id);
        
        // --- INICIO DEL CAMBIO CLAVE ---

        // 1. Mensaje de éxito actualizado: Ahora informa al barbero del nuevo comportamiento.
        walkInStatus.textContent = '¡Servicio iniciado! El pago se solicitará al finalizar.';
        walkInStatus.className = 'status-message success';
        
        // 2. Notifica a otros módulos que los datos han cambiado (esto ya estaba y es correcto).
        document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));

        // 3. Eliminamos la llamada directa a showPaymentModal() y simplemente cerramos el modal de "visita inmediata"
        //    después de un momento para que el barbero pueda leer el mensaje de éxito.
        setTimeout(() => {
            closeWalkInModal();
        }, 2000);

        // --- FIN DEL CAMBIO CLAVE ---

    } catch (error) {
        console.error("Error en visita inmediata:", error);
        walkInStatus.textContent = `Error: ${error.message}`;
        walkInStatus.className = 'status-message error';
    } finally {
        submitBtn.disabled = false;
    }
}


// ===== SECCIÓN DE NOTIFICACIONES Y RECORDATORIOS =====

async function checkUpcomingAppointments() {
    if (!currentUserId) return;
    const now = new Date();
   const today = toLocalISODate(now); 

    const { data: citas, error } = await supabaseClient
        .from('citas')
        .select('id, fecha_cita, hora_inicio_cita, cliente_nombre, cliente_telefono')
        .eq('barbero_id', currentUserId)
        .eq('fecha_cita', today) // <-- LÍNEA CORREGIDA
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


// =========================================================================
// INICIO DE LA MEJORA: LÓGICA UNIFICADA PARA VERIFICACIÓN DE CITAS
// =========================================================================

// EN: js/barberProfile.js

/**
 * Inicia los ciclos de verificación para asistencia y para pagos.
 */
function startConfirmationChecker() {
    // Limpiar intervalos existentes para evitar duplicados
    if (confirmationCheckInterval) clearInterval(confirmationCheckInterval);
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);

    // 1. Ejecutar ambas verificaciones una vez al cargar la página
    checkAndProcessOverdueAppointments(); // ¿Llegó el cliente?
    checkAndProcessFinishedAppointments(); // ¿Terminó el servicio?
    
    // 2. Establecer intervalos para seguir verificando en tiempo real
    confirmationCheckInterval = setInterval(checkAndProcessOverdueAppointments, 15000); // Cada 15s
    paymentCheckInterval = setInterval(checkAndProcessFinishedAppointments, 15000); // Cada 15s
}

/**
 * Busca y procesa TODAS las citas que ya debieron haber comenzado
 * y cuyo estado aún no ha sido resuelto (pendiente, confirmada, etc.).
 * Esta función unifica la lógica para citas pasadas del mismo día y de días anteriores.
 */
async function checkAndProcessOverdueAppointments() {
    if (!currentUserId) return;

    const now = new Date();
    const today = toLocalISODate(now); // Formato YYYY-MM-DD
    const currentTime = now.toTimeString().slice(0, 8); // Formato HH:MM:SS

    // Construimos una consulta compleja con OR para buscar citas que cumplan:
    // a) La fecha es anterior a hoy.
    // b) La fecha es hoy Y la hora de inicio es anterior a la hora actual.
    const { data: overdueCitas, error } = await supabaseClient
        .from('citas')
        .select('*') // Traemos todo para los modales
        .eq('barbero_id', currentUserId)
        .in('estado', [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED])
        .or(`fecha_cita.lt.${today},and(fecha_cita.eq.${today},hora_inicio_cita.lt.${currentTime})`);

    if (error) {
        console.error("Error buscando citas pasadas para confirmar:", error);
        return;
    }

    if (!overdueCitas || overdueCitas.length === 0) {
        return;
    }

    console.log(`Se encontraron ${overdueCitas.length} citas pasadas por procesar.`);

    // Procesamos las citas de una en una para no abrumar con modales.
    for (const cita of overdueCitas) {
        // Si ya se mostró un modal para esta cita en esta sesión, la saltamos.
        if (promptedConfirmationIds.has(cita.id)) continue; 

        // Determinamos qué modal mostrar
        const endTime = new Date(`${cita.fecha_cita}T${cita.hora_fin_cita}`);
        
        if (cita.estado === APPOINTMENT_STATUS.IN_PROGRESS && now >= endTime) {
            // La cita "en proceso" ya terminó -> Mostrar modal de PAGO.
            showPaymentModal(cita);
        } else {
            // La cita "pendiente" o "confirmada" ya pasó su hora de inicio -> Mostrar modal de CONFIRMACIÓN DE ASISTENCIA.
            showConfirmationModal(cita);
        }
        
        promptedConfirmationIds.add(cita.id);
        
        // Rompemos el bucle para mostrar solo un modal a la vez.
        // El siguiente se mostrará en la próxima verificación (15s) si es necesario.
        break; 
    }
}
// AÑADE ESTA NUEVA FUNCIÓN en js/barberProfile.js

/**
 * Busca citas "en proceso" que ya han terminado para solicitar el pago.
 */
async function checkAndProcessFinishedAppointments() {
    if (!currentUserId) return;

    const now = new Date();
    const today = toLocalISODate(now);
    const currentTime = now.toTimeString().slice(0, 8);

    // Esta consulta busca específicamente servicios que están "en proceso" y cuya hora de fin ya pasó.
    const { data: finishedCitas, error } = await supabaseClient
        .from('citas')
        .select('*') // Necesitamos todos los datos para el modal de pago
        .eq('barbero_id', currentUserId)
        .eq('estado', APPOINTMENT_STATUS.IN_PROGRESS) // <-- Solo busca citas EN PROCESO
        .or(`fecha_cita.lt.${today},and(fecha_cita.eq.${today},hora_fin_cita.lt.${currentTime})`); // <-- Compara con la HORA DE FIN

    if (error) {
        console.error("Error buscando citas finalizadas para pago:", error);
        return;
    }

    if (!finishedCitas || finishedCitas.length === 0) {
        return; // No hay nada que hacer
    }

    // Procesamos solo una a la vez para no mostrar múltiples modales
    for (const cita of finishedCitas) {
        // Si ya mostramos un modal para esta cita, la saltamos
        if (promptedConfirmationIds.has(cita.id)) continue; 

        // ¡Esta cita ha terminado y necesita que se registre el pago!
        showPaymentModal(cita);
        
        // IMPORTANTE: Marcamos la cita como "ya procesada" para no volver a mostrar el modal
        promptedConfirmationIds.add(cita.id);
        
        // Salimos del bucle para mostrar solo un modal a la vez
        break; 
    }
}


// =========================================================================
// FIN DE LA LÓGICA UNIFICADA
// =========================================================================


/**
 * Muestra el modal de confirmación de asistencia.
 * @param {object} cita - El objeto de la cita.
 */
function showConfirmationModal(cita) {
    if (!confirmationOverlay || !cita) return;

    const message = `¿El cliente ${cita.cliente_nombre} se presentó a su cita de las ${cita.hora_inicio_cita.substring(0, 5)}?`;
    confirmationText.textContent = message;

    // Acción si el cliente SÍ LLEGÓ
    confirmArrivalBtn.onclick = () => {
        markAppointmentInProgress(cita.id); // Cambia el estado a "en proceso"
        closeConfirmationModal();
    };
    // Acción si el cliente NO LLEGÓ
    confirmNoshowBtn.onclick = async () => {
        markAppointmentAsNoShow(cita.id, cita.fecha_cita);
        closeConfirmationModal();
    };
    
    confirmationCloseBtn.onclick = () => {
        closeConfirmationModal();
    };

    confirmationOverlay.classList.add('active');
}

// En: js/barberProfile.js

async function markAppointmentInProgress(citaId) {
    if (saveStatus) saveStatus.textContent = "Iniciando servicio...";

    const { error } = await supabaseClient
        .from('citas')
        .update({ estado: APPOINTMENT_STATUS.IN_PROGRESS })
        .eq('id', citaId);

    if (error) {
        alert('Error al iniciar el servicio: ' + error.message);
        if (saveStatus) saveStatus.textContent = "Error.";
    } else {
        if (saveStatus) saveStatus.textContent = "Servicio en proceso. El pago se solicitará al finalizar.";
        
        // ======================= INICIO DE LA CORRECCIÓN =======================
        //
        // AQUÍ ESTÁ LA CLAVE: Añadimos el ID de la cita al set de "ya procesadas"
        // para esta sesión. Esto evita que el verificador automático (setInterval)
        // la vuelva a tomar inmediatamente para mostrar el modal de pago.
        //
        promptedConfirmationIds.add(citaId);
        //
        // ======================== FIN DE LA CORRECCIÓN =========================

        fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        const selectedDay = document.querySelector('.calendar-day.selected-day');
        if (selectedDay) {
            loadAndRenderBookingsForDate(selectedDay.dataset.date);
        }
    }
    setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 4000);
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


// Pega estas funciones en js/barberProfile.js

/**
 * Abre el modal para que el usuario ingrese su contraseña antes de una acción peligrosa.
 */
function openPasswordConfirmModal() {
    if (!passwordConfirmOverlay) return;
    // Resetea el estado del modal cada vez que se abre
    passwordConfirmInput.value = '';
    passwordConfirmStatus.textContent = '';
    passwordConfirmStatus.className = 'status-message';
    passwordConfirmActionBtn.disabled = false;
    passwordConfirmActionBtn.innerHTML = '<i class="fas fa-check"></i> Confirmar y Borrar';
    passwordConfirmOverlay.classList.add('active');
}

/**
 * Cierra el modal de confirmación de contraseña.
 */
function closePasswordConfirmModal() {
    if (passwordConfirmOverlay) {
        passwordConfirmOverlay.classList.remove('active');
    }
}

/**
 * Maneja el proceso de borrado de datos históricos después de verificar la contraseña.
 */
async function handleConfirmDataDeletion() {
    const password = passwordConfirmInput.value;
    if (!password) {
        passwordConfirmStatus.textContent = 'Por favor, introduce tu contraseña.';
        passwordConfirmStatus.className = 'status-message error';
        return;
    }

    passwordConfirmActionBtn.disabled = true;
    passwordConfirmActionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    passwordConfirmStatus.textContent = 'Verificando credenciales...';
    passwordConfirmStatus.className = 'status-message';

    try {
        // 1. Obtener el email del usuario actual para la re-autenticación
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user || !user.email) {
            throw new Error("No se pudo obtener la información del usuario actual.");
        }

        // 2. Verificar la contraseña. Este es el paso de seguridad CRÍTICO.
        const { error: authError } = await supabaseClient.auth.signInWithPassword({
            email: user.email,
            password: password,
        });

        if (authError) {
            throw new Error("Contraseña incorrecta. Inténtalo de nuevo.");
        }

        // 3. Si la contraseña es correcta, proceder con el borrado
        passwordConfirmStatus.textContent = 'Contraseña correcta. Borrando historial...';
        
        // Borramos en paralelo para más eficiencia
        const [citasError, notificacionesError] = await Promise.all([
            supabaseClient.from('citas').delete().eq('barbero_id', currentUserId),
            supabaseClient.from('notificaciones').delete().eq('barbero_id', currentUserId)
        ]);

        if (citasError.error || notificacionesError.error) {
            console.error("Error en borrado:", { citasError, notificacionesError });
            throw new Error("Ocurrió un error al borrar los datos.");
        }

        // 4. Éxito
        passwordConfirmStatus.textContent = '¡Historial borrado con éxito!';
        passwordConfirmStatus.className = 'status-message success';

        // Disparamos un evento para que todos los módulos se actualicen
        document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
        
        setTimeout(() => {
            closePasswordConfirmModal();
            alert("Todo tu historial de citas y notificaciones ha sido eliminado.");
        }, 2000);

    } catch (error) {
        console.error("Error en el proceso de borrado:", error);
        passwordConfirmStatus.textContent = error.message;
        passwordConfirmStatus.className = 'status-message error';
        passwordConfirmActionBtn.disabled = false;
        passwordConfirmActionBtn.innerHTML = '<i class="fas fa-check"></i> Confirmar y Borrar';
    }
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

            try {
                // 2. Espera un instante para que el navegador renderice el loader antes de continuar.
                await new Promise(resolve => setTimeout(resolve, 50)); 

                contentSections.forEach(section => section.classList.remove('active'));
                
                // 3. Carga los datos necesarios para la sección específica
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
                    document.dispatchEvent(new CustomEvent('clientListChanged'));
                    link.dataset.loaded = true;
                }
                 if (targetId === 'reservas' && !link.dataset.loaded) {
                    await fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
                    link.dataset.loaded = true;
                }
                
                menuLinks.forEach(l => l.getAttribute('data-target') && l.classList.remove('active'));
                link.classList.add('active');
                
                // 4. Muestra la sección de destino
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.classList.add('active');
                }

            } catch (error) {
                console.error(`Error al cargar la sección ${targetId}:`, error);
            } finally {
                if (loader) loader.classList.remove('active');
            }
        });
    });
}

// Pega esta función en js/barberProfile.js, junto a las otras de "setup"

function setupPasswordConfirmModalListeners() {
    if (deleteHistoryBtn) {
        deleteHistoryBtn.addEventListener('click', openPasswordConfirmModal);
    }
    if (passwordConfirmOverlay) {
        // Cierra el modal si se hace clic fuera del contenido
        passwordConfirmOverlay.addEventListener('click', (e) => {
            if (e.target === passwordConfirmOverlay) closePasswordConfirmModal();
        });
    }
    if (passwordConfirmCloseBtn) {
        passwordConfirmCloseBtn.addEventListener('click', closePasswordConfirmModal);
    }
    if (passwordConfirmActionBtn) {
        passwordConfirmActionBtn.addEventListener('click', handleConfirmDataDeletion);
    }
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

async function saveCurrencySettings() {
    const markupInput = document.getElementById('tasa-markup');
    if (!markupInput) return;

    const markupValue = parseFloat(markupInput.value) || 0;

    const { error } = await supabaseClient
        .from('barberos')
        .update({ porcentaje_markup_tasa: markupValue })
        .eq('user_id', currentUserId); // O usa currentBarberProfileId si lo prefieres

    if (error) {
        throw new Error(`Error al guardar configuración de moneda: ${error.message}`);
    }
}


// js/barberProfile.js

async function loadDashboardStats() {
    const loadingStatus = document.getElementById('dashboard-loading-status');
    const statsGrid = document.getElementById('dashboard-stats-grid');
    const incomeUsdEl = document.getElementById('stat-monthly-income-usd');
    const incomeVesEl = document.getElementById('stat-monthly-income-ves');

    // Verificación de que todos los elementos existen antes de continuar
    if (!loadingStatus || !statsGrid || !currentUserId || !incomeUsdEl || !incomeVesEl) {
        console.warn("No se pueden cargar las estadísticas del dashboard: faltan elementos del DOM o el ID de usuario.");
        return;
    }

    loadingStatus.style.display = 'block';
    statsGrid.style.display = 'none';

    try {
        const today = new Date().toISOString().split('T')[0];
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

        // --- Hacemos las 4 consultas en paralelo para máxima eficiencia ---
        const [
            { count: activeBookings, error: bookingsError },
            { count: totalClients, error: clientsError },
            { data: incomeDataUsd, error: incomeErrorUsd },
            { data: incomeDataVes, error: incomeErrorVes }
        ] = await Promise.all([
            supabaseClient.from('citas').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId).gte('fecha_cita', today),
            supabaseClient.from('clientes').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId),
            
            // Sumar solo los ingresos en USD de la columna correcta
            supabaseClient.from('citas').select('monto_recibido_usd').eq('barbero_id', currentUserId).gte('fecha_cita', firstDayOfMonth).eq('estado', 'completada'),
            
            // Sumar solo los ingresos en VES de la columna correcta
            supabaseClient.from('citas').select('monto_recibido_ves').eq('barbero_id', currentUserId).gte('fecha_cita', firstDayOfMonth).eq('estado', 'completada')
        ]);

        if (bookingsError || clientsError || incomeErrorUsd || incomeErrorVes) {
            console.error("Error en una de las consultas del dashboard:", { bookingsError, clientsError, incomeErrorUsd, incomeErrorVes });
            throw new Error("No se pudieron obtener todas las estadísticas.");
        }

        // Calculamos los totales sumando los resultados
        const monthlyIncomeUsd = (incomeDataUsd || []).reduce((sum, item) => sum + (item.monto_recibido_usd || 0), 0);
        const monthlyIncomeVes = (incomeDataVes || []).reduce((sum, item) => sum + (item.monto_recibido_ves || 0), 0);
        
        // Actualizamos el HTML con los valores obtenidos
        document.getElementById('stat-active-bookings').textContent = activeBookings || 0;
        document.getElementById('stat-unique-clients').textContent = totalClients || 0;

        incomeUsdEl.textContent = `USD ${monthlyIncomeUsd.toFixed(2)}`;
        incomeVesEl.textContent = `VES ${monthlyIncomeVes.toFixed(2)}`; // Usamos la variable global de currencyManager
        
        loadingStatus.style.display = 'none';
        statsGrid.style.display = 'grid';

    } catch (error) {
        console.error('Error fatal cargando estadísticas del dashboard:', error);
        loadingStatus.textContent = 'Error al cargar estadísticas.';
        loadingStatus.style.color = 'var(--danger-color)';
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

const toLocalISODate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

function getPeriodDates(period) {
    const now = new Date();
    const current_end = new Date(now); 

    let current_start, previous_start, previous_end;

    if (period === 'year') {
        current_start = new Date(now.getFullYear(), 0, 1);
        previous_end = new Date(current_start.getTime());
        previous_end.setDate(current_start.getDate() - 1);
        previous_start = new Date(previous_end.getFullYear(), 0, 1);
    } else if (period === 'month') {
        current_start = new Date(now.getFullYear(), now.getMonth(), 1);
        previous_end = new Date(current_start.getTime());
        previous_end.setDate(current_start.getDate() - 1);
        previous_start = new Date(previous_end.getFullYear(), previous_end.getMonth(), 1);
    } else { // 'week'
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = startOfToday.getDay(); 
        current_start = new Date(startOfToday.getTime());
        current_start.setDate(startOfToday.getDate() - dayOfWeek);
        previous_end = new Date(current_start.getTime());
        previous_end.setDate(current_start.getDate() - 1);
        previous_start = new Date(current_start.getTime());
        previous_start.setDate(current_start.getDate() - 7);
    }

    return {
        current: { start: toLocalISODate(current_start), end: toLocalISODate(current_end) },
        previous: { start: toLocalISODate(previous_start), end: toLocalISODate(previous_end) }
    };
}



// EN: js/barberProfile.js

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

        // Se mantienen las consultas como las tenías
        const [
            currentTransactionsRes, 
            previousTransactionsRes, // Esta consulta ya la tenías bien para los ingresos
            currentAppointmentsRes, 
            previousAppointmentsRes,
            currentClientsRes, 
            previousClientsRes
        ] = await Promise.all([
            // Consulta para transacciones/ingresos del periodo actual
            supabaseClient.from('citas')
                .select('*, barbero_servicios(*, servicios_maestro(*))') // Trae todo para la lista
                .eq('barbero_id', currentUserId)
                .gte('fecha_cita', current.start)
                .lte('fecha_cita', current.end)
                .eq('estado', 'completada'),
            
            // Consulta para transacciones/ingresos del periodo anterior
            supabaseClient.from('citas')
                .select('monto_recibido_usd, monto_recibido_ves') // Solo los montos
                .eq('barbero_id', currentUserId)
                .gte('fecha_cita', previous.start)
                .lte('fecha_cita', previous.end)
                .eq('estado', 'completada'),
            
            // Consultas para citas y clientes (estas se mantienen)
            supabaseClient.from('citas').select('fecha_cita', { count: 'exact' }).eq('barbero_id', currentUserId).gte('fecha_cita', current.start).lte('fecha_cita', current.end).in('estado', ['completada', 'en proceso', 'confirmada']),
            supabaseClient.from('citas').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId).gte('fecha_cita', previous.start).lte('fecha_cita', previous.end).in('estado', ['completada', 'en proceso', 'confirmada']),
            supabaseClient.from('clientes').select('created_at', { count: 'exact' }).eq('barbero_id', currentUserId).gte('created_at', current.start + 'T00:00:00').lte('created_at', current.end + 'T23:59:59'),
            supabaseClient.from('clientes').select('*', { count: 'exact', head: true }).eq('barbero_id', currentUserId).gte('created_at', previous.start + 'T00:00:00').lte('created_at', previous.end + 'T23:59:59'),
        ]);

        const errors = [currentTransactionsRes, previousTransactionsRes, currentAppointmentsRes, previousAppointmentsRes, currentClientsRes, previousClientsRes].map(r => r.error).filter(Boolean);
        if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));
        
        // --- INICIO DE LA CORRECCIÓN LÓGICA ---
        // Se declara una sola vez y se usa para todos los cálculos.
        
        // 1. Cálculo de ingresos con ambas monedas
        const calculateTotalIncome = (transactions) => {
            let usd = 0;
            let ves = 0;
            (transactions || []).forEach(item => {
                usd += item.monto_recibido_usd || 0;
                ves += item.monto_recibido_ves || 0;
            });
            return { usd, ves };
        };

        const currentIncome = calculateTotalIncome(currentTransactionsRes.data);
        const previousIncome = calculateTotalIncome(previousTransactionsRes.data);

        // 2. Cálculo del porcentaje de ingresos unificando a USD (solo para comparación)
        const currentTotalEquivalentUSD = currentIncome.usd + (currentIncome.ves / (currencyManager.finalRate || 1));
        const previousTotalEquivalentUSD = previousIncome.usd + (previousIncome.ves / (currencyManager.finalRate || 1));

        let incomePercentage = 0; // <-- ÚNICA DECLARACIÓN DE LA VARIABLE
        if (previousTotalEquivalentUSD > 0) {
            incomePercentage = ((currentTotalEquivalentUSD - previousTotalEquivalentUSD) / previousTotalEquivalentUSD) * 100;
        } else if (currentTotalEquivalentUSD > 0) {
            incomePercentage = 100;
        }
        
        // --- SE ELIMINAN LAS DECLARACIONES REDUNDANTES DE AQUÍ ---

        // 3. Cálculo de citas y clientes (sin cambios)
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
        
        // 4. Se construye el objeto final de datos para los reportes
        const reportData = {
            period,
            income: { 
                totalUSD: currentIncome.usd, 
                totalVES: currentIncome.ves,
                percentage: incomePercentage, 
                data: currentTransactionsRes.data || []
            },
            appointments: {
                total: appointmentsTotal,
                percentage: appointmentsPercentage,
                data: currentAppointmentsRes.data || []
            },
            clients: {
                total: clientsTotal,
                percentage: clientsPercentage,
                data: currentClientsRes.data || []
            }
        };
        // --- FIN DE LA CORRECCIÓN LÓGICA ---
        
        currentPeriodAppointments = [...(currentTransactionsRes.data || [])];
        renderReportCharts(reportData);
        renderTransactionList(currentPeriodAppointments);

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


// EN: js/barberProfile.js

function groupDataForChart(data, period, dateField, mode = 'count', sumFieldOrFn = 'monto') {
    const formatLabel = (date, p) => {
        if (p === 'year') return monthsOfYear[date.getMonth()].substring(0, 3);
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    const { current } = getPeriodDates(period);
    const startDate = new Date(current.start + 'T00:00:00');
    const endDate = new Date(current.end + 'T23:59:59');

    let groups = {};
    let categories = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const label = formatLabel(new Date(d), period);
        if (!groups.hasOwnProperty(label)) {
            groups[label] = 0;
            categories.push(label);
        }
    }

    data.forEach(item => {
        const date = new Date(item[dateField]);
        const label = formatLabel(date, period);
        if (groups.hasOwnProperty(label)) {
            if (mode === 'sum') {
                // Si sumFieldOrFn es una función, la usamos, si no, usamos el campo
                const valueToAdd = typeof sumFieldOrFn === 'function' 
                    ? sumFieldOrFn(item)
                    : (item[sumFieldOrFn] || 0);
                groups[label] += valueToAdd;
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

    // El gráfico de ingresos se renderiza con los datos unificados en USD para mostrar la tendencia
    const incomeChartData = groupDataForChart(
        data.income.data, 
        data.period, 
        'fecha_cita', 
        'sum', 
        // Función personalizada para sumar el equivalente en USD
        (item) => (item.monto_recibido_usd || 0) + ((item.monto_recibido_ves || 0) / (currencyManager.finalRate || 1))
    );

    ReportCharts.renderChart({
        chartId: 'income-area-chart',
        series: incomeChartData.series,
        categories: incomeChartData.categories,
        themeColor: 'var(--success-color)',
    });

    // PERO: Actualizamos el texto de las tarjetas con los valores REALES y separados
    const incomeStatUsd = document.getElementById('income-stat-value');
    const incomeStatVes = document.getElementById('income-stat-value-ves');

    if(incomeStatUsd) incomeStatUsd.textContent = `USD ${data.income.totalUSD.toFixed(2)}`;
    if(incomeStatVes) incomeStatVes.textContent = `VES ${data.income.totalVES.toFixed(2)}`;

    ReportCharts.updateChartInfo({
        percentage: data.income.percentage,
        percentageElId: 'income-percentage',
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
               ? `- ${currencyManager.formatPrice(item.monto || 0)}`  
               :`+ ${currencyManager.formatPrice(item.monto || 0)}`;

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

function filterAndRenderTransactions() {
    const searchInput = document.getElementById('transaction-search-input');
    const debtButton = document.getElementById('toggle-debt-btn');
    
    if (!searchInput || !debtButton) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const showOnlyDebts = debtButton.classList.contains('active');

    let filteredList = [...currentPeriodAppointments]; 

    if (searchTerm) {
        filteredList = filteredList.filter(item => 
            item.cliente_nombre && item.cliente_nombre.toLowerCase().includes(searchTerm)
        );
    }

    if (showOnlyDebts) {
        filteredList = filteredList.filter(item => {
            return item.estado_pago === 'pendiente' || (item.estado === 'pendiente' && item.estado_pago !== 'pagado');
        });
    }
    
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
    const daysContainer = document.getElementById('calendar-days');
    const monthYearDisplay = document.getElementById('cal-current-month-year');
    
    if (!daysContainer || !monthYearDisplay) return;

    daysContainer.innerHTML = '';
    monthYearDisplay.textContent = `${monthsOfYear[month]} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    const startDayOfWeek = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;

    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.classList.add('day', 'empty');
        daysContainer.appendChild(emptyDay);
    }

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('day');
        dayElement.textContent = day;

        const currentDateObj = new Date(year, month, day);
        const dateString = toLocalISODate(currentDateObj);
        dayElement.dataset.date = dateString;
        dayElement.dataset.dayOfWeek = currentDateObj.getDay();

        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            dayElement.classList.add('today');
        }

        if (monthlyBookingsMap.has(dateString)) {
            dayElement.classList.add('has-bookings');
        }

        dayElement.addEventListener('click', (e) => handleCalendarDayClick(e.currentTarget, dateString, currentDateObj.getDay()));
        
        daysContainer.appendChild(dayElement);
    }
}

// REEMPLAZA esta función en js/barberProfile.js
function handleCalendarDayClick(dayElement, dateString, dayOfWeekIndex) {
    // 1. Marca visualmente el día seleccionado en el calendario
    document.querySelectorAll('.day.selected').forEach(d => d.classList.remove('selected'));
    dayElement.classList.add('selected');
    
    // --- ESTA ES LA CORRECCIÓN ---
    // En lugar de ir directo a las citas, llamamos al modal de acciones
    // para que el barbero elija qué hacer.
    showCalendarActionModal(dateString, dayOfWeekIndex);
}
// AÑADE esta nueva función en js/barberProfile.js

/**
 * Abre el modal de acciones directamente en la vista de "Citas del Día".
 * @param {string} dateString - La fecha para la cual mostrar las citas (formato YYYY-MM-DD).
 */
function showBookingsForDayModal(dateString) {
    currentActionModalDate = { dateString, dayOfWeek: new Date(dateString + 'T12:00:00').getDay() };

    const overlay = document.getElementById('calendar-action-modal-overlay');
    const dateText = document.getElementById('modal-selected-date-text');

    // Configura el título del modal con la fecha amigable
    const friendlyDate = new Date(dateString + 'T12:00:00').toLocaleDateString('es-ES', { dateStyle: 'long' });
    dateText.textContent = friendlyDate;

    // Oculta la vista de botones de acción
    document.getElementById('modal-action-buttons-view').style.display = 'none';

    // Muestra el contenedor principal del contenido del modal
    document.getElementById('modal-content-view').style.display = 'block';

    // Activa específicamente el visor de citas y desactiva los demás
    document.querySelectorAll('.modal-content-viewer').forEach(v => v.classList.remove('active'));
    document.querySelector('.modal-content-viewer[data-viewer="bookings"]').classList.add('active');

    // Carga y renderiza las citas para la fecha seleccionada
    loadAndRenderBookingsForDate(dateString);

    // Finalmente, muestra el modal ya configurado
    overlay.classList.add('active');
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

// REEMPLAZA esta función en js/barberProfile.js
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
        
        // --- MEJORA ---
        const isHighlighted = booking.id === highlightedCitaId;
        const highlightClass = isHighlighted ? 'highlighted-booking' : '';
        const bookingIdAttr = `id="booking-item-${booking.id}"`;

        html += `
            <div class="booking-item ${highlightClass}" ${bookingIdAttr}>
                <h4>${booking.hora_inicio_cita.substring(0,5)} - ${booking.hora_fin_cita.substring(0,5)}</h4>
                <p><strong>Cliente:</strong> ${booking.cliente_nombre}</p>
                <p><strong>Teléfono:</strong> ${booking.cliente_telefono || 'No provisto'}</p>
                <p><strong>Servicio:</strong> ${serviceName}</p>
                <p><strong>Estado:</strong> <span style="text-transform: capitalize;">${booking.estado}</span></p>
            </div>`;
    });
    bookingsList.innerHTML = html;

    // --- MEJORA ---
    // Si hay una cita para resaltar, la buscamos y hacemos scroll hacia ella
    if (highlightedCitaId) {
        const highlightedElement = document.getElementById(`booking-item-${highlightedCitaId}`);
        if (highlightedElement) {
            highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Limpiamos la variable para que no afecte a futuras interacciones
        highlightedCitaId = null; 
    }
}

function renderBarberForm(barberData) {
    if (!profileContent) return;
    currentBarberName = barberData?.nombre || 'barbero';
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

// REEMPLAZA ESTA FUNCIÓN en js/barberProfile.js

function renderServices(barberServices) {
    if (!servicesSection) return;

    // Función auxiliar para generar el HTML de un servicio
    const createServiceHTML = (service, isCustom) => {
        const serviceId = isCustom ? `custom-${service.id}` : service.id;
        const serviceName = isCustom ? service.nombre_personalizado : service.servicios_maestro?.nombre;
        const imageUrl = service.imagen_url || 'https://placehold.co/100x100/2a2f3c/7e8a9b?text=Subir\\nFoto';
        
        // Atributos de datos para el manejo de la subida
        const dataAttrs = `data-service-id="${serviceId}" data-is-custom="${isCustom}"`;

        return `
            <div class="service-item-with-image" ${dataAttrs}>
                <div class="service-image-container">
                    <img src="${imageUrl}" alt="Imagen de ${serviceName}" id="img-preview-${serviceId}" class="service-img-preview">
                    <label for="img-upload-${serviceId}" class="service-img-upload-label" title="Cambiar imagen">
                        <i class="fas fa-camera"></i>
                    </label>
                    <input type="file" id="img-upload-${serviceId}" class="service-img-upload-input" accept="image/*">
                </div>
                <div class="service-details">
                    <span class="service-name">${serviceName}</span>
                    <div class="service-inputs">
                        <input type="number" class="service-price-input" placeholder="Precio ($)" value="${service.precio || ''}" step="0.50" min="0">
                        <input type="number" class="service-duration-input" placeholder="Min" value="${service.duracion_minutos || 30}" step="5" min="5">
                    </div>
                </div>
                ${isCustom ? `<button class="remove-custom-service" data-id="${service.id}"><i class="fas fa-times"></i></button>` : ''}
            </div>
        `;
    };
    
    // Filtramos los servicios estándar que el barbero ha seleccionado
    const standardServices = masterServices.map(ms => {
        const existingService = barberServices.find(bs => bs.servicio_id === ms.id) || { servicios_maestro: ms, precio: '', duracion_minutos: 30 };
        return { ...existingService, id: ms.id }; // Aseguramos que tenga un id base
    });

    const customServices = barberServices.filter(bs => bs.nombre_personalizado);
    
    let html = '<h3>Servicios Estándar</h3><div class="services-grid">';
    standardServices.forEach(s => {
        html += createServiceHTML(s, false);
    });
    html += '</div>';

    html += '<h3 style="margin-top:20px;">Mis Servicios Personalizados</h3><div class="services-grid">';
    if (customServices.length > 0) {
        customServices.forEach(bs => {
            html += createServiceHTML(bs, true);
        });
    } else {
        html += '<p>No has añadido servicios personalizados.</p>';
    }
    html += '</div>';
    
    servicesSection.innerHTML = html;

    // Listeners para previsualizar la imagen al seleccionarla
    servicesSection.querySelectorAll('.service-img-upload-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const serviceId = e.target.id.replace('img-upload-', '');
            const imgPreview = document.getElementById(`img-preview-${serviceId}`);
            if (file && imgPreview) {
                const reader = new FileReader();
                reader.onload = (event) => { imgPreview.src = event.target.result; };
                reader.readAsDataURL(file);
            }
        });
    });
    
    // Listener para eliminar servicios personalizados (sin cambios)
    servicesSection.querySelectorAll('.remove-custom-service').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const serviceId = e.currentTarget.dataset.id;
            if (confirm('¿Seguro que quieres eliminar este servicio personalizado?')) {
                if (saveStatus) saveStatus.textContent = 'Eliminando...';
                const { error } = await supabaseClient.from('barbero_servicios').delete().eq('id', serviceId);
                if (error) { 
                    alert('Error al eliminar: ' + error.message); 
                    if (saveStatus) saveStatus.textContent = 'Error.'; 
                } else {
                    if (saveStatus) saveStatus.textContent = 'Eliminado.';
                    const { data, error: errLoad } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
                    if (errLoad) console.error("Error recargando servicios:", errLoad);
                    else {
                        barberServicesData = data || []; // Actualiza la variable global
                        renderServices(barberServicesData);
                    }
                    setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 2000);
                }
            }
        });
    });
}

// EN: js/barberProfile.js
function renderBookingLink(userId) {
    if (!bookingLinkContainer || !userId || !currentBarberName) return;

    const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const longBookingUrl = `${baseUrl}/reserva.html?barber_id=${userId}`;

    bookingLinkContainer.innerHTML = `<p>Generando enlace corto...</p>`;

    // Llama a la Edge Function 'shorten-link'
    supabaseClient.functions.invoke('shorten-link', {
        body: {
            longUrl: longBookingUrl,
            barberName: currentBarberName
        },
    }).then(({ data, error }) => {
        let finalUrl = longBookingUrl; // Usar la URL larga como respaldo

        if (error) {
            console.error('Error al invocar la Edge Function:', error);
        } else if (data && data.shortUrl) {
            finalUrl = data.shortUrl; // Éxito: usar la URL corta de Bitly
        }

        // Renderiza el resultado final
        bookingLinkContainer.innerHTML = `
            <a href="${finalUrl}" target="_blank">${finalUrl}</a>
            <br><br>
            <button id="copy-link-btn" class="profile-action-btn" style="width:auto;padding:8px 15px;font-size:0.9em;">
                <i class="fas fa-copy"></i> Copiar Enlace
            </button>`;

        document.getElementById('copy-link-btn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(finalUrl)
                .then(() => alert('¡Enlace copiado!'))
                .catch(err => alert('Error al copiar el enlace.'));
        });
    });
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

// REEMPLAZA ESTA FUNCIÓN. ESTA ES LA VERSIÓN CORREGIDA Y DEFINITIVA.

// REEMPLAZA esta función en js/barberProfile.js para la corrección final

async function navigateToDateFromNotification(dateString) {
    if (!dateString) return;

    const loader = document.getElementById('section-loader-overlay');
    const targetId = 'reservas';
    const targetSection = document.getElementById(targetId);
    const targetLink = document.querySelector(`.menu-link[data-target="${targetId}"]`);

    if (!targetSection || !targetLink) return;

    if (loader) loader.classList.add('active');
    
    // Cambia a la pestaña de "Reservas"
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));
    targetSection.classList.add('active');
    targetLink.classList.add('active');

    try {
        const targetDate = new Date(dateString + 'T12:00:00');
        currentCalendarDate = targetDate;
        
        // Carga el calendario para el mes correcto
        await fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());

        // ======================= INICIO DE LA CORRECCIÓN CLAVE =======================
        //
        // En lugar de llamar a handleCalendarDayClick (que muestra el menú de acciones),
        // llamamos directamente a la función que abre el modal en la vista de citas.
        // Como la variable 'highlightedCitaId' ya se estableció en el listener,
        // la cita correcta será resaltada automáticamente.
        //
        showBookingsForDayModal(dateString);
        //
        // ======================== FIN DE LA CORRECCIÓN CLAVE =========================

    } catch (error) {
        console.error('Error al navegar a la fecha desde la notificación:', error);
    } finally {
        if (loader) loader.classList.remove('active');
    }
}
// EN: js/barberProfile.js

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
    
    // --- INICIO DEL BLOQUE DE CÓDIGO CORRECTO (SIN DUPLICADOS) ---

    // Listener para el botón de cambio de moneda en DASHBOARD
    const toggleDashboardBtn = document.getElementById('toggle-income-currency-btn');
    const dashboardUsdEl = document.getElementById('stat-monthly-income-usd');
    const dashboardVesEl = document.getElementById('stat-monthly-income-ves');

    if (toggleDashboardBtn && dashboardUsdEl && dashboardVesEl) {
        toggleDashboardBtn.addEventListener('click', () => {
            const isUsdVisible = dashboardUsdEl.style.display === 'block';
            dashboardUsdEl.style.display = isUsdVisible ? 'none' : 'block';
            dashboardVesEl.style.display = isUsdVisible ? 'block' : 'none';
        });
    }

    // Listener para el botón de cambio de moneda en REPORTES
    const toggleReportBtn = document.getElementById('toggle-report-currency-btn');
    const reportUsdEl = document.getElementById('income-stat-value');
    const reportVesEl = document.getElementById('income-stat-value-ves');

    if (toggleReportBtn && reportUsdEl && reportVesEl) {
        toggleReportBtn.addEventListener('click', () => {
            const isUsdVisible = reportUsdEl.style.display === 'block';
            reportUsdEl.style.display = isUsdVisible ? 'none' : 'block';
            reportVesEl.style.display = isUsdVisible ? 'block' : 'none';
        });
    }
    
    // --- FIN DEL BLOQUE DE CÓDIGO CORRECTO ---
}


// ===== LÓGICA PARA EL MODAL DE ACCIONES DEL CALENDARIO =====

let currentActionModalDate = { dateString: null, dayOfWeek: null };

// MODIFICA esta función en js/barberProfile.js

function setupCalendarActionModal() {
    const overlay = document.getElementById('calendar-action-modal-overlay');
    const closeBtn = document.getElementById('calendar-action-modal-close-btn');
    const viewBookingsBtn = document.getElementById('modal-view-bookings-btn');
    const editAvailabilityBtn = document.getElementById('modal-edit-availability-btn');
    const backBtn = document.getElementById('modal-back-btn');

    const modal = document.getElementById('calendar-action-modal');
    if (!overlay || !modal) return;

    const closeModal = () => closeCalendarActionModal();

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    closeBtn.addEventListener('click', closeModal);

    // Este botón ahora es un "extra" por si se llega a la vista de acciones
    viewBookingsBtn.addEventListener('click', () => {
        showBookingsForDayModal(currentActionModalDate.dateString);
    });

   editAvailabilityBtn.addEventListener('click', () => {
    document.getElementById('modal-action-buttons-view').style.display = 'none';
    document.getElementById('modal-content-view').style.display = 'block';
    const viewer = document.querySelector('.modal-content-viewer[data-viewer="availability"]');
    viewer.classList.add('active');

    // ===== AQUÍ ESTÁ LA CORRECCIÓN CLAVE =====
    // Asignamos el índice del día a la variable global ANTES de mostrar el editor.
    activeEditingDayIndex = currentActionModalDate.dayOfWeek;
    // =========================================
    
    // Ahora esta función solo muestra los datos, y el estado ya está guardado.
    displayAvailabilityForDay(activeEditingDayIndex);
});

    // El botón "Volver" ahora te llevará al menú de selección de acciones
    backBtn.addEventListener('click', () => {
        document.getElementById('modal-content-view').style.display = 'none';
        document.querySelector('.modal-content-viewer.active')?.classList.remove('active');
        document.getElementById('modal-action-buttons-view').style.display = 'block';
    });
    
    // ===== INICIO DE LA MEJORA: Listener para el nuevo botón de guardado =====
const saveDayBtn = document.getElementById('save-day-availability-btn');
if (saveDayBtn) {
    saveDayBtn.addEventListener('click', async () => {
        // Llama a la nueva función de guardado con el día actualmente en edición.
        await saveAvailabilityForDay(currentActionModalDate.dayOfWeek);
    });
}
// ===== FIN DE LA MEJORA =====
}


function showCalendarActionModal(dateString, dayOfWeek) {
    currentActionModalDate = { dateString, dayOfWeek };
    
    const overlay = document.getElementById('calendar-action-modal-overlay');
    const dateText = document.getElementById('modal-selected-date-text');
    
    const friendlyDate = new Date(dateString + 'T12:00:00').toLocaleDateString('es-ES', { dateStyle: 'long' });
    dateText.textContent = friendlyDate;

    document.getElementById('modal-action-buttons-view').style.display = 'block';
    document.getElementById('modal-content-view').style.display = 'none';
    document.querySelectorAll('.modal-content-viewer').forEach(v => v.classList.remove('active'));

    document.getElementById('bookings-list').innerHTML = '';
    document.getElementById('selected-day-slots-container').innerHTML = '';

    overlay.classList.add('active');
}

function closeCalendarActionModal() {
    const overlay = document.getElementById('calendar-action-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// En: js/barberProfile.js

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

    // **CORRECCIÓN CLAVE:** Usar 'currentBarberProfileId' que es el ID de la tabla de perfiles.
    const { error } = await supabaseClient.from('barbero_servicios').insert({
        barbero_id: currentBarberProfileId, // <-- ¡CORREGIDO!
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
        
        // Recargar los servicios para refrescar la UI
        const { data, error: errLoad } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentBarberProfileId);
        if (errLoad) {
            console.error("Error recargando servicios:", errLoad);
        } else {
            barberServicesData = data || [];
            renderServices(barberServicesData);
        }
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

// REEMPLAZA ESTA FUNCIÓN en barberProfile.js

async function saveAllChanges() {
    if (saveStatus) saveStatus.textContent = "Guardando...";
    if (saveAllButton) saveAllButton.disabled = true;

    try {
        // La función ahora devuelve el perfil actualizado.
        const updatedProfile = await saveBasicProfile();
        await saveServices();
        await saveAvailability();
        await saveCurrencySettings(); // <-- AÑADE ESTA LLAMADA


        // Volvemos a renderizar el formulario con la nueva información.
        if (updatedProfile) {
            renderBarberForm(updatedProfile);
        }

        if (saveStatus) saveStatus.textContent = "¡Todos los cambios guardados con éxito! ✅";
        
        if (activeEditingDayIndex !== -1) {
             // Esta lógica es para la disponibilidad, la dejamos como está.
            displayAvailabilityForDay(activeEditingDayIndex);
        }

        setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 3000);

    } catch (error) {
        console.error("Error al guardar todo:", error);
        if (saveStatus) saveStatus.textContent = `Error: ${error.message}`;
    } finally {
        if (saveAllButton) saveAllButton.disabled = false;
    }
}

// REEMPLAZA ESTA FUNCIÓN en barberProfile.js

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

    // ================== INICIO DE LA CORRECCIÓN ==================
    // Usamos la llave primaria del perfil (`currentBarberProfileId`) para la actualización.
    const { data: updatedProfile, error } = await supabaseClient
        .from('barberos')
        .update({ nombre, telefono, foto_perfil_url })
        .eq('id', currentBarberProfileId) // <-- ¡CORREGIDO! Usamos 'id' y 'currentBarberProfileId'.
        .select() // <-- AÑADIDO: Para obtener los datos actualizados.
        .single();
    // =================== FIN DE LA CORRECCIÓN ====================

    if (error) throw new Error(`Perfil Básico: ${error.message}`);

    // Devolvemos el perfil actualizado para refrescar la UI.
    return updatedProfile;
}


// Función para subir imagen de servicio a Cloudinary con carpeta por barbero
async function uploadServiceImageToCloudinary(file, barberId, serviceId) {
    try {
        // Primero obtenemos la firma desde tu Edge Function
        const response = await supabaseClient.functions.invoke('generate-cloudinary-signature', {
            body: { barberId, serviceId }
        });

        if (response.error) {
            throw new Error(response.error.message);
        }

        const { signature, timestamp, api_key, cloud_name, folder } = response.data;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', api_key);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('folder', folder);
        formData.append('eager', 'w_400,h_400,c_fill,g_auto');

        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const uploadData = await uploadResponse.json();

        if (uploadData.secure_url) {
            return uploadData.secure_url;
        } else {
            throw new Error(uploadData.error?.message || 'Error al subir imagen');
        }

    } catch (error) {
        console.error('Error en uploadServiceImageToCloudinary:', error);
        throw error;
    }
}

// Función para subir imagen de servicio a Cloudinary con carpeta por barbero
async function uploadServiceImageToCloudinary(file, barberId, serviceId) {
    try {
        // Primero obtenemos la firma desde tu Edge Function
        const response = await supabaseClient.functions.invoke('generate-cloudinary-signature', {
            body: { barberId, serviceId }
        });

        if (response.error) {
            throw new Error(response.error.message);
        }

        const { signature, timestamp, api_key, cloud_name, folder } = response.data;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', api_key);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        formData.append('folder', folder);
        formData.append('eager', 'w_400,h_400,c_fill,g_auto');

        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const uploadData = await uploadResponse.json();

        if (uploadData.secure_url) {
            return uploadData.secure_url;
        } else {
            throw new Error(uploadData.error?.message || 'Error al subir imagen');
        }

    } catch (error) {
        console.error('Error en uploadServiceImageToCloudinary:', error);
        throw error;
    }
}

// En: js/barberProfile.js

// ✅ Función corregida para guardar servicios con imágenes por barbero
// ✅ Función final corregida para guardar servicios con imágenes y UUIDs válidos
async function saveServices() {
    if (!currentBarberProfileId) {
        throw new Error("No se pudo identificar al barbero para guardar los servicios.");
    }

    const serviceItems = document.querySelectorAll('.service-item-with-image');
    const standardServices = [];
    const customServices = [];

    for (const item of serviceItems) {
        const price = parseFloat(item.querySelector('.service-price-input')?.value || 0);
        const duration = parseInt(item.querySelector('.service-duration-input')?.value || 0, 10);
        const fileInput = item.querySelector('.service-img-upload-input');
        const imgPreview = item.querySelector('.service-img-preview');

        if (isNaN(price) || price <= 0 || isNaN(duration) || duration <= 0) continue;

        const serviceIdRaw = item.dataset.serviceId;
        const isCustom = item.dataset.isCustom === 'true';

        let imageUrl = imgPreview?.src?.startsWith('https') ? imgPreview.src : null;

        if (fileInput?.files?.[0]) {
            try {
                const compressedFile = await imageCompression(fileInput.files[0], {
                    maxSizeMB: 0.3,
                    maxWidthOrHeight: 600
                });

                imageUrl = await uploadServiceImageToCloudinary(
                    compressedFile,
                    currentBarberProfileId,
                    serviceIdRaw
                );
            } catch (uploadError) {
                console.error("Error subiendo imagen:", uploadError);
                alert("Hubo un error al subir la imagen. Se guardará sin ella.");
            }
        }

        const serviceData = {
            barbero_id: currentBarberProfileId,
            precio: price,
            duracion_minutos: duration,
            imagen_url: imageUrl
        };

        if (isCustom) {
            // ✅ Servicio personalizado sin servicio_id
            const customId = parseInt(serviceIdRaw.replace('custom-', ''), 10);
            if (!isNaN(customId)) {
                serviceData.id = customId;
                customServices.push(serviceData);
            }
        } else {
            // ✅ Servicio estándar con servicio_id numérico
            const standardId = parseInt(serviceIdRaw, 10);
            if (!isNaN(standardId)) {
                serviceData.servicio_id = standardId;
                standardServices.push(serviceData);
            }
        }
    }

    const errors = [];

    if (standardServices.length > 0) {
        const { error } = await supabaseClient
            .from('barbero_servicios')
            .upsert(standardServices, { onConflict: 'barbero_id, servicio_id' });
        if (error) errors.push(error);
    }

    if (customServices.length > 0) {
        const { error } = await supabaseClient
            .from('barbero_servicios')
            .upsert(customServices);
        if (error) errors.push(error);
    }

    if (errors.length > 0) {
        throw new Error(`Error al guardar servicios: ${errors.map(e => e.message).join(', ')}`);
    }

    console.log('✅ Servicios guardados con éxito.');
}



async function saveAvailability() {
    
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

/**
 * Guarda la disponibilidad para un solo día específico.
 * Esta función es llamada desde el modal de edición del calendario.
 * @param {number} dayIndex - El índice del día de la semana (0=Domingo, 6=Sábado).
 */
async function saveAvailabilityForDay(dayIndex) {
    const statusEl = document.getElementById('modal-save-status');
    const saveBtn = document.getElementById('save-day-availability-btn');
    if (!statusEl || !saveBtn) return;

    statusEl.textContent = "Guardando...";
    statusEl.className = 'status-message';
    saveBtn.disabled = true;

    try {
        // 1. Obtener los horarios directamente desde la UI del modal
        const slotsForDay = [];
        const editorContainer = document.getElementById('selected-day-slots-container');
        const slotElements = editorContainer.querySelectorAll('.time-slot');

        for (const slotEl of slotElements) {
            const inputs = slotEl.querySelectorAll('input[type="time"]');
            const start = inputs[0].value;
            const end = inputs[1].value;

            if (!start || !end) {
                throw new Error("Hay bloques horarios incompletos. Por favor, llénalos o elimínalos.");
            }
            if (start >= end) {
                throw new Error(`Horario inválido: la hora de inicio (${start}) debe ser anterior a la de fin (${end}).`);
            }
            slotsForDay.push({
                barbero_id: currentUserId,
                dia_semana: dayIndex,
                hora_inicio: start,
                hora_fin: end
            });
        }

        // 2. Borrar en la DB SOLO los horarios del día que se está editando
        const { error: deleteError } = await supabaseClient
            .from('disponibilidad')
            .delete()
            .eq('barbero_id', currentUserId)
            .eq('dia_semana', dayIndex);

        if (deleteError) {
            throw new Error(`Error al limpiar horarios anteriores: ${deleteError.message}`);
        }

        // 3. Insertar los nuevos horarios si existen
        if (slotsForDay.length > 0) {
            const { error: insertError } = await supabaseClient
                .from('disponibilidad')
                .insert(slotsForDay);

            if (insertError) {
                throw new Error(`Error al guardar los nuevos horarios: ${insertError.message}`);
            }
        }

        // 4. Actualizar la variable global en memoria para consistencia
        weeklyAvailabilityData[dayIndex] = slotsForDay.map(s => ({
            hora_inicio: s.hora_inicio,
            hora_fin: s.hora_fin
        }));

        statusEl.textContent = "¡Horario guardado con éxito! ✅";
        statusEl.className = 'status-message success';

    } catch (error) {
        console.error('Error al guardar disponibilidad del día:', error);
        statusEl.textContent = error.message;
        statusEl.className = 'status-message error';
    } finally {
        saveBtn.disabled = false;
        setTimeout(() => {
            if(statusEl) statusEl.textContent = "";
        }, 4000);
    }
}

// Pega estas dos funciones en tu archivo /js/barberProfile.js

/**
 * Revisa los parámetros de la URL al cargar la página para ejecutar acciones directas.
 * Por ejemplo, abrir un modal específico tras hacer clic en una notificación push.
 */
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const citaId = urlParams.get('citaId');
    const fechaCita = urlParams.get('fecha');

    // Si no hay un ID de cita en la URL, no hacemos nada.
    if (!citaId) {
        // Limpiamos la URL si tenía parámetros irrelevantes para evitar recargas con acciones viejas.
        if (window.location.search) {
            history.replaceState(null, '', window.location.pathname);
        }
        return;
    }

    console.log(`Parámetros de URL detectados: action=${action}, citaId=${citaId}, fecha=${fechaCita}`);

    // Determina qué modal o acción ejecutar basado en el parámetro 'action'.
    if (action === 'confirm_attendance') {
        console.log(`Acción: Abrir modal de confirmación para la cita ${citaId}`);
        fetchCitaAndShowModal(citaId, showConfirmationModal);
    } 
    // --- ✅ INICIO DE LA NUEVA LÓGICA ---
    else if (action === 'register_payment') {
        console.log(`Acción: Abrir modal de pago para la cita ${citaId}`);
        fetchCitaAndShowModal(citaId, showPaymentModal); // Llama al modal de pago.
    } 
    // --- ✅ FIN DE LA NUEVA LÓGICA ---
    else if (action === 'show_reminder') {
        console.log(`Acción: Abrir modal de recordatorio para la cita ${citaId}`);
        fetchCitaAndShowModal(citaId, showReminderAlert);
    } 
    else if (fechaCita) {
        // Esta acción es para el recordatorio, que solo navega al calendario.
        console.log(`Acción: Navegar al calendario en la fecha ${fechaCita}`);
        document.dispatchEvent(new CustomEvent('navigateToDate', {
            detail: {
                dateString: fechaCita,
                citaId: citaId
            }
        }));
    }

    // Limpiamos la URL después de procesar la acción para que no se repita en una recarga.
    history.replaceState(null, '', window.location.pathname);
}

/**
 * Función auxiliar para buscar los datos completos de una cita por su ID y
 * luego invocar una función de modal, pasándole esos datos.
 * @param {string} citaId - El ID de la cita a buscar.
 * @param {function} modalFunction - La función que mostrará el modal (ej: showConfirmationModal).
 */
async function fetchCitaAndShowModal(citaId, modalFunction) {
    if (!supabaseClient) {
        console.error("Supabase client no está disponible para buscar la cita.");
        return;
    }
    
    // Muestra un loader general si existe
    const appLoader = document.getElementById('app-loader');
    if (appLoader) appLoader.classList.remove('hidden');

    try {
        const { data: cita, error } = await supabaseClient
            .from('citas')
            .select('*') // Seleccionamos todo para que el modal tenga toda la info
            .eq('id', citaId)
            .single();

        if (error) {
            throw new Error(`No se pudo encontrar la cita ${citaId}: ${error.message}`);
        }
        if (cita) {
            modalFunction(cita); // ¡Éxito! Llamamos a la función del modal con los datos
        } else {
            throw new Error(`La cita con ID ${citaId} no fue encontrada.`);
        }
    } catch (err) {
        console.error("Error al buscar y mostrar el modal:", err);
        alert("Hubo un problema al cargar los detalles de la cita desde la notificación. Por favor, recarga la página.");
    } finally {
        if (appLoader) appLoader.classList.add('hidden'); // Ocultamos el loader
    }
}


// --- INICIAR ---
document.addEventListener('DOMContentLoaded', initProfileModule);


document.addEventListener('paymentProcessed', (e) => {
        console.log(`Pago procesado para la cita ${e.detail.citaId}. Refrescando datos...`);
        if (saveStatus) {
            saveStatus.textContent = "Pago registrado y cita finalizada con éxito. ✅";
            setTimeout(() => { if(saveStatus) saveStatus.textContent = "" }, 4000);
        }

        document.dispatchEvent(new CustomEvent('datosCambiadosPorReserva'));
        
        document.dispatchEvent(new CustomEvent('clientListChanged'));

        fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        const selectedDay = document.querySelector('.day.selected');
        if (selectedDay) {
            loadAndRenderBookingsForDate(selectedDay.dataset.date);
        }
    });

/**
 * =================================================================
 * ===== INICIO DE LA LÓGICA PARA NOTIFICACIONES PUSH NATIVAS =====
 * =================================================================
 */

// Reemplaza esta con la Clave Pública que generaste.
const VAPID_PUBLIC_KEY = 'BKJEejtTEJo6dV_IOtvPTkeCpP3ArlhWtUL92k6dYC4OC9k2Y-FfULVu8cNOyF6Rnhdayl44xv45SpcPQuQp1JU';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// EN: js/barberProfile.js

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.error('Push Messaging no soportado: No hay Service Worker.');
        return;
    }

    try {
        // --- ESTA ES LA LÍNEA QUE DEBES CAMBIAR ---
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registrado con éxito:', registration);

        await checkAndRenewSubscription();

    } catch (error) {
        console.error('Fallo en el registro del Service Worker: ', error);
    }
}

async function checkAndRenewSubscription() {
    if (!('serviceWorker' in navigator) || !currentUserId) return;
    const pushStatusEl = document.getElementById('push-status');

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();

    if (existingSubscription) {
        console.log('Suscripción Push ya existente.');
        if (pushStatusEl) {
            pushStatusEl.textContent = 'Las notificaciones push están activas.';
            pushStatusEl.style.color = 'var(--success-color)';
        }
    } else {
        if (pushStatusEl) {
            pushStatusEl.textContent = 'Las notificaciones push no están activas.';
            pushStatusEl.style.color = 'var(--secondary-text-color)';
        }
    }
}

async function subscribeUserToPush() {
    const pushStatusEl = document.getElementById('push-status');
    if (!('serviceWorker' in navigator) || !currentUserId) {
        alert('Tu navegador no es compatible con notificaciones push.');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            alert('Ya estás suscrito a las notificaciones.');
            return;
        }

        pushStatusEl.textContent = 'Solicitando permiso...';
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('Usuario suscrito:', subscription);
             // --- INICIO DE LA SOLUCIÓN ---

        // PASO 1: VERIFICA EL VALOR DE currentUserId EN LA CONSOLA
        console.log('Intentando guardar la suscripción para el User ID:', currentUserId);

        // PASO 2: DETÉN LA EJECUCIÓN SI EL ID NO EXISTE
        if (!currentUserId) {
            console.error('Error Crítico: currentUserId es nulo. No se puede guardar la suscripción.');
            document.getElementById('push-status').textContent = 'Error: No se pudo identificar al usuario.';
            return; // Detiene la función aquí mismo
        }

        // --- FIN DE LA SOLUCIÓN ---
        
        pushStatusEl.textContent = 'Guardando suscripción...';

        // Guardar la suscripción en la base de datos
        const { error } = await supabaseClient.from('push_subscriptions').insert({
            user_id: currentUserId,
            subscription_info: subscription
        });

        if (error) {
            throw new Error('No se pudo guardar la suscripción en el servidor.');
        }

        pushStatusEl.textContent = '¡Notificaciones activadas con éxito!';
        pushStatusEl.style.color = 'var(--success-color)';

    } catch (err) {
        console.error('Fallo al suscribirse a Push: ', err);
        let message = 'No se pudieron activar las notificaciones.';
        if (Notification.permission === 'denied') {
            message += ' Has bloqueado los permisos. Debes activarlos en la configuración de tu navegador.';
        }
        pushStatusEl.textContent = message;
        pushStatusEl.style.color = 'var(--danger-color)';
    }
}

function setupPushNotificationButton() {
    const enablePushBtn = document.getElementById('enable-push-notifications-btn');
    if (enablePushBtn) {
        enablePushBtn.addEventListener('click', subscribeUserToPush);
    }
}

/**
 * Configura los listeners para el nuevo modal de recordatorio.
 */
function setupReminderModalListeners() {
    if (!reminderOverlay || !reminderCloseBtn) return;

    const closeModal = () => {
        reminderOverlay.classList.remove('active');
    };

    reminderCloseBtn.addEventListener('click', closeModal);
    reminderOverlay.addEventListener('click', (e) => {
        if (e.target === reminderOverlay) {
            closeModal();
        }
    });
}

/**
 * Muestra el modal de recordatorio con los datos de la cita.
 * @param {object} cita - El objeto de la cita.
 */
function showReminderModal(cita) {
    if (!reminderOverlay || !reminderClientName || !reminderTime) return;

    reminderClientName.textContent = cita.cliente_nombre;
    const time = new Date(`1970-01-01T${cita.hora_inicio_cita}`).toLocaleTimeString('es-ES', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    reminderTime.textContent = time;

    reminderOverlay.classList.add('active');

    // Reproducir un sonido sutil para llamar la atención
    const audio = new Audio('https://cdn.freesound.org/previews/571/571408_6424653-lq.mp3');
    audio.volume = 0.3; // Volumen más bajo para una alerta
    audio.play().catch(e => console.warn("No se pudo reproducir el sonido de recordatorio.", e));
}

/**
 * Inicia el ciclo de verificación para los recordatorios de citas.
 */
function startReminderChecker() {
    if (reminderCheckInterval) clearInterval(reminderCheckInterval);
    
    // Ejecutar la verificación una vez al iniciar
    checkUpcomingAppointmentReminders();
    
    // Establecer el intervalo para que verifique cada minuto
    reminderCheckInterval = setInterval(checkUpcomingAppointmentReminders, 60000); // 60000 ms = 1 minuto
}

/**
 * Busca citas que están a 30 minutos o menos de comenzar y muestra una advertencia.
 */
async function checkUpcomingAppointmentReminders() {
    if (!currentUserId) return;

    const now = new Date();
    const today = toLocalISODate(now);
    const currentTime = now.toTimeString().slice(0, 8);

    // Buscamos citas para hoy, que aún no han pasado y cuyo estado es pendiente o confirmada.
    const { data: citas, error } = await supabaseClient
        .from('citas')
        .select('id, cliente_nombre, hora_inicio_cita, fecha_cita')
        .eq('barbero_id', currentUserId)
        .eq('fecha_cita', today)
        .in('estado', [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED])
        .gt('hora_inicio_cita', currentTime); // Clave: solo citas futuras

    if (error) {
        console.error("Error buscando citas para recordar:", error);
        return;
    }

    if (!citas || citas.length === 0) {
        return;
    }

    // Procesamos las citas encontradas
    for (const cita of citas) {
        // Si ya mostramos una alerta para esta cita, la saltamos
        if (remindedAppointmentIds.has(cita.id)) {
            continue;
        }

        const appointmentTime = new Date(`${cita.fecha_cita}T${cita.hora_inicio_cita}`);
        const diffMinutes = (appointmentTime.getTime() - now.getTime()) / 60000;

        // Si faltan 30 minutos o menos, mostramos el modal
        if (diffMinutes <= 30) {
            console.log(`Recordatorio para la cita ID ${cita.id} a las ${cita.hora_inicio_cita}. Faltan ${diffMinutes.toFixed(1)} minutos.`);
            showReminderModal(cita);
            notifiedAppointmentIds.add(cita.id);
            
            // Rompemos el bucle para mostrar solo un modal a la vez.
            // La siguiente advertencia aparecerá en la próxima verificación.
            break; 
        }
    }
}

// AÑADIR ESTA NUEVA FUNCIÓN EN js/barberProfile.js

/**
 * Busca citas que están a 30 minutos o menos de comenzar y muestra una alerta al barbero.
 */
async function checkUpcomingAppointments() {
    if (!currentUserId) return;

    const now = new Date();

    // Buscamos citas para hoy, que aún no han pasado y cuyo estado es pendiente o confirmada.
    const { data: citas, error } = await supabaseClient
        .from('citas')
        .select('id, fecha_cita, hora_inicio_cita, cliente_nombre, cliente_telefono')
        .eq('barbero_id', currentUserId)
        .eq('fecha_cita', now.toISOString().split('T')[0]) // Solo citas de hoy
        .in('estado', [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.PENDING]) // Solo las que no han empezado ni se han cancelado
        .gte('hora_inicio_cita', now.toTimeString().slice(0, 8)); // Solo citas futuras en el día de hoy

    if (error) {
        console.error("Error buscando citas próximas:", error);
        return;
    }
    
    if (!citas) return;

    // Procesamos cada cita encontrada
    citas.forEach(cita => {
        // Si ya mostramos una alerta para esta cita en esta sesión, la saltamos.
        if (notifiedAppointmentIds.has(cita.id)) return;

        const appointmentTime = new Date(`${cita.fecha_cita}T${cita.hora_inicio_cita}`);
        const diffMinutes = (appointmentTime.getTime() - now.getTime()) / 60000;

        // Si la cita es en 30 minutos o menos (y no ha pasado), mostramos la alerta.
        if (diffMinutes <= 30 && diffMinutes > 0) {
            showReminderAlert(cita); // Llamamos a la función que muestra el modal
            notifiedAppointmentIds.add(cita.id); // La añadimos al set para no volver a notificar
        }
    });
}

// AÑADIR ESTA NUEVA FUNCIÓN EN js/barberProfile.js

/**
 * Muestra el modal de recordatorio y lo configura con los datos de la cita.
 * @param {object} cita El objeto de la cita.
 */
function showReminderAlert(cita) {
    const overlay = document.getElementById('appointment-alert-overlay');
    const title = document.getElementById('alert-modal-title');
    const messageTextarea = document.getElementById('alert-modal-message');
    const whatsappBtn = document.getElementById('alert-modal-whatsapp-btn');

    if (!overlay || !title || !messageTextarea || !whatsappBtn) return;

    // 1. Llenar el modal con la información de la cita
    title.textContent = `¡Cita en ~30 min con ${cita.cliente_nombre}!`;
    messageTextarea.value = `Hola ${cita.cliente_nombre}, te escribo para recordarte que nuestra cita es dentro de unos 30 minutos. ¡Por favor, confírmame tu asistencia!`;

    // 2. Función para generar y actualizar el enlace de WhatsApp
    const updateWhatsappLink = () => {
        // Validación por si un cliente antiguo no tiene teléfono
        if (!cita.cliente_telefono) {
            whatsappBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Cliente sin teléfono';
            whatsappBtn.style.pointerEvents = 'none';
            whatsappBtn.style.backgroundColor = '#6c757d'; // Un color gris
            return;
        }

        const message = messageTextarea.value;
        const phone = cita.cliente_telefono.replace(/[\s+()-]/g, ''); // Limpia el número
        whatsappBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    };

    // 3. Generar el enlace inicial y actualizarlo si el barbero edita el mensaje
    updateWhatsappLink();
    messageTextarea.onkeyup = updateWhatsappLink;

    // 4. Mostrar el modal
    overlay.classList.add('active');
    
    // 5. (Opcional) Reproducir un sonido para llamar la atención del barbero
    const audio = new Audio('https://cdn.freesound.org/previews/571/571408_6424653-lq.mp3'); // Sonido sutil
    audio.volume = 0.5;
    audio.play().catch(e => console.log("No se pudo reproducir sonido de alerta.", e));
}

// AÑADIR ESTA NUEVA FUNCIÓN EN js/barberProfile.js

function setupAlertModalListeners() {
    const overlay = document.getElementById('appointment-alert-overlay');
    const closeBtn = document.getElementById('alert-modal-close-btn');
    const modal = document.getElementById('appointment-alert-modal');

    const closeModal = () => {
        if (overlay) overlay.classList.remove('active');
    };

    if (overlay) overlay.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    // Evita que el modal se cierre al hacer clic dentro de él
    if(modal) modal.addEventListener('click', (e) => e.stopPropagation());
}

// AÑADE ESTA NUEVA FUNCIÓN EN js/barberProfile.js

/**
 * Inicia un ciclo de verificación para buscar citas próximas y mostrar alertas.
 */
function startAppointmentChecker() {
    // Si ya existe un intervalo, lo limpiamos para evitar duplicados.
    if (appointmentCheckInterval) {
        clearInterval(appointmentCheckInterval);
    }

    // 1. Ejecutamos la verificación una vez tan pronto como se inicia.
    checkUpcomingAppointments();

    // 2. Establecemos un intervalo para que se repita cada 60 segundos (60000 ms).
    // Esto es suficiente para no sobrecargar el sistema y dar el aviso a tiempo.
    appointmentCheckInterval = setInterval(checkUpcomingAppointments, 60000);

    console.log("✅ Verificador de citas próximas iniciado. Se ejecutará cada minuto.");
}

function handlePushNotificationRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const fechaCita = urlParams.get('fecha');
    const idCita = urlParams.get('citaId');

    // Si ambos parámetros existen, significa que venimos de una notificación.
    if (fechaCita && idCita) {
        console.log(`Redirección desde Push detectada. Navegando a la cita ${idCita} del ${fechaCita}.`);

        // Disparamos el mismo evento que usan las notificaciones internas.
        // Esto reutiliza la lógica que ya te funciona perfectamente.
        document.dispatchEvent(new CustomEvent('navigateToDate', {
            detail: {
                dateString: fechaCita,
                citaId: idCita
            }
        }));

        // Limpia los parámetros de la URL para que no se repita la acción si el usuario recarga.
        history.replaceState(null, '', window.location.pathname);
    }
}

// --- CÓDIGO PARA PEGAR AL FINAL DE barberProfile.js ---

// Agrega este bloque de código a tu archivo js/barberProfile.js
// La función `handleUrlParameters` ya existe, solo necesitas añadir el nuevo caso `else if`.

function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action'); //
    const citaId = urlParams.get('citaId'); //
    const fechaCita = urlParams.get('fecha'); //

    if (!citaId) {
        if (window.location.search) {
            history.replaceState(null, '', window.location.pathname);
        }
        return;
    }

    console.log(`Parámetros de URL detectados: action=${action}, citaId=${citaId}, fecha=${fechaCita}`); //

    if (action === 'confirm_attendance') { //
        console.log(`Acción: Abrir modal de confirmación para la cita ${citaId}`);
        fetchCitaAndShowModal(citaId, showConfirmationModal); //
    } 
    // --- INICIO DE LA MEJORA ---
    else if (action === 'show_reminder') {
        console.log(`Acción: Abrir modal de recordatorio para la cita ${citaId}`);
        // Esta función ya existe en tu código y es perfecta para esto.
        // Busca la cita y le pasa los datos a la función `showReminderAlert`.
        fetchCitaAndShowModal(citaId, showReminderAlert); //
    } 
    // --- FIN DE LA MEJORA ---
    else if (action === 'register_payment') { //
        console.log(`Acción: Abrir modal de pago para la cita ${citaId}`);
        fetchCitaAndShowModal(citaId, showPaymentModal); //
    } else if (fechaCita) { //
        console.log(`Acción: Navegar al calendario en la fecha ${fechaCita}`);
        document.dispatchEvent(new CustomEvent('navigateToDate', {
            detail: {
                dateString: fechaCita,
                citaId: citaId
            }
        })); //
    }

    history.replaceState(null, '', window.location.pathname); //
}

async function fetchCitaAndShowModal(citaId, modalFunction) {
    if (!supabaseClient) {
        console.error("Supabase client no está disponible para buscar la cita.");
        return;
    }

    const appLoader = document.getElementById('app-loader');
    if (appLoader) appLoader.classList.remove('hidden');

    try {
        const { data: cita, error } = await supabaseClient
            .from('citas')
            .select('*')
            .eq('id', citaId)
            .single();

        if (error) {
            throw new Error(`No se pudo encontrar la cita ${citaId}: ${error.message}`);
        }

        if (cita) {
            modalFunction(cita);
        } else {
            throw new Error(`La cita con ID ${citaId} no fue encontrada.`);
        }

    } catch (err) {
        console.error("Error al buscar y mostrar el modal:", err);
        alert("Hubo un problema al cargar los detalles de la cita. Por favor, recarga la página.");
    } finally {
        if (appLoader) appLoader.classList.add('hidden');
    }
}



// /js/barberProfile.js

// ... (tu código existente) ...

// Agrega esta función para manejar las acciones desde la URL.
function handleUrlActions() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const citaId = urlParams.get('citaId');

    if (!action || !citaId) {
        return; // No hay acción que realizar.
    }

    // Buscamos la cita en la lista de citas ya cargada.
    // Asumimos que tienes una variable como 'todasLasCitas' o similar.
    // Si no, necesitarías buscarla en el DOM o hacer un fetch.
    const citaCard = document.querySelector(`.cita-card[data-id='${citaId}']`);
    if (!citaCard) {
        console.warn(`No se encontró la tarjeta de la cita con ID: ${citaId}`);
        return;
    }

    if (action === 'confirm_attendance') {
        // Obtenemos los datos de la tarjeta para pasarlos al modal.
        const clienteNombre = citaCard.querySelector('.cliente-nombre').textContent;
        const horaCita = citaCard.querySelector('.cita-hora').textContent;
        
        // Llenamos y mostramos el modal de confirmación.
        // (Asegúrate de que los IDs y clases coincidan con tu HTML)
        document.getElementById('confirmAttendanceModal').style.display = 'block';
        document.getElementById('attendanceCitaId').value = citaId;
        document.getElementById('attendanceClientName').textContent = clienteNombre;
        document.getElementById('attendanceCitaTime').textContent = horaCita;

    } else if (action === 'request_payment') {
        // Llenamos y mostramos el modal de pago.
        // (Asegúrate de que los IDs y clases coincidan con tu HTML)
        const servicio = citaCard.dataset.servicio; // Asumiendo que guardas los datos en el dataset
        const precio = citaCard.dataset.precio;

        document.getElementById('paymentModal').style.display = 'block';
        document.getElementById('paymentCitaId').value = citaId;
        document.getElementById('paymentClientName').textContent = citaCard.querySelector('.cliente-nombre').textContent;
        document.getElementById('paymentService').textContent = servicio;
        document.getElementById('paymentAmount').textContent = precio;
    }
    
    // Opcional: Limpiar la URL para que la acción no se repita si el usuario recarga la página.
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Llama a la función cuando el DOM esté completamente cargado.
document.addEventListener('DOMContentLoaded', handleUrlActions);



