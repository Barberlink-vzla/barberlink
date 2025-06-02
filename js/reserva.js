// js/reserva.js
const SUPABASE_URL = 'https://ktoboiohgwsdjdggjdyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b2JvaW9oZ3dzZGpkZ2dqZHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyMjM1OTAsImV4cCI6MjA2Mzc5OTU5MH0.Rs1F3p9h9BacH1Vd2MyoqErzVKI_do2zYHy2bAIDUvw';

let supabaseClient;
let selectedBarberId = null;
let barberInfo = {};
let barberServices = [];
let barberAvailability = [];
let barberBookings = []; // Citas existentes para una fecha

// --- Elementos del DOM para el formulario multipasos ---
const barberNameTitle = document.getElementById('barber-name-title');
const bookingForm = document.getElementById('barberBookingForm'); // ID del nuevo formulario
const bookingStatus = document.getElementById('booking-status');
const whatsappLinkContainer = document.getElementById('whatsapp-link-container');

// Inputs específicos de cada paso
const serviceSelect = document.getElementById('service-select');
const datePicker = document.getElementById('date-picker');
const timeSelect = document.getElementById('time-select');
const clienteNombreInput = document.getElementById('cliente-nombre');
const clienteApellidoInput = document.getElementById('cliente-apellido');
const clienteTelefonoInput = document.getElementById('cliente-telefono');

// Resumen
const summaryDiv = document.getElementById('booking-summary');
const summaryBarberName = document.getElementById('summary-barber-name');
const summaryClientName = document.getElementById('summary-client-name');
const summaryClientPhone = document.getElementById('summary-client-phone');
const summaryService = document.getElementById('summary-service');
const summaryPrice = document.getElementById('summary-price');
const summaryDate = document.getElementById('summary-date');
const summaryTime = document.getElementById('summary-time');

// Elementos de la imagen del barbero
const barberImageHeader = document.getElementById('booking-barber-image-header');
const barberImageElement = document.getElementById('booking-barber-image');


// --- Lógica del formulario multipasos ---
const steps = Array.from(document.querySelectorAll('.form-step'));
const nextButtons = document.querySelectorAll('.next-btn');
const prevButtons = document.querySelectorAll('.prev-btn');
const submitWhatsappButton = document.getElementById('submitWhatsapp');
const progressBarSteps = document.querySelectorAll('.progress-bar-step');
const progressBarLines = document.querySelectorAll('.progress-bar-line');
let currentStep = 0;


// --- INICIALIZACIÓN ---
const initSupabaseInBooking = () => {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Cliente Supabase inicializado en reserva.js ✅");

        const urlParams = new URLSearchParams(window.location.search);
        selectedBarberId = urlParams.get('barber_id');

        if (!selectedBarberId) {
            console.error("Falta el ID del barbero en la URL (ej: ?barber_id=UUID). Intentando cargar el primer barbero.");
            if (barberNameTitle) barberNameTitle.textContent = "Cargando Barbero...";
            loadFirstBarberAsFallback();
        } else {
            loadBookingData();
        }
        // Llamar a setupMultiStepFormEventListeners después de que el DOM esté listo y Supabase inicializado.
        // Los elementos del DOM deberían estar disponibles aquí.
        setupMultiStepFormEventListeners();
    } else {
        console.warn("Supabase CDN no cargado en reserva.js. Reintentando... ⏳");
        setTimeout(initSupabaseInBooking, 200);
    }
};

async function loadFirstBarberAsFallback() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('barberos')
        .select('user_id, nombre') // Pedimos también el nombre para el título
        .limit(1)
        .single();

    if (error || !data) {
        console.error("Error cargando barbero de fallback o no hay barberos:", error);
        if (barberNameTitle) barberNameTitle.textContent = "Error: Barbero no disponible.";
        if (bookingStatus) bookingStatus.textContent = "No se pudo cargar la información del barbero.";
        disableForm();
        return;
    }
    
    selectedBarberId = data.user_id;
    console.warn("ID de barbero no encontrado en URL. Cargando primer barbero por defecto:", selectedBarberId);
    loadBookingData();
}

function disableForm() {
    if (bookingForm) {
        const allInputs = bookingForm.querySelectorAll('input, select, button');
        allInputs.forEach(input => input.disabled = true);
    }
    if (bookingStatus) bookingStatus.textContent = "El formulario de reserva está deshabilitado hasta que se cargue un barbero.";
}


// --- CARGA DE DATOS DEL BARBERO Y SERVICIOS ---
async function loadBookingData() {
    if (!selectedBarberId || !supabaseClient) {
        if (barberNameTitle) barberNameTitle.textContent = "Error: Barbero no especificado.";
        disableForm();
        return;
    }
    
    if (bookingStatus) bookingStatus.textContent = "Cargando datos del barbero...";
    try {
        const [barberRes, servicesRes, availabilityRes] = await Promise.all([
            supabaseClient.from('barberos').select('*').eq('user_id', selectedBarberId).single(),
            supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', selectedBarberId).order('id', { foreignTable: 'servicios_maestro', ascending: true }),
            supabaseClient.from('disponibilidad').select('*').eq('barbero_id', selectedBarberId).order('dia_semana').order('hora_inicio')
        ]);

        if (barberRes.error) throw new Error(`Barbero: ${barberRes.error.message}`);
        if (!barberRes.data) throw new Error(`No se encontró el barbero con ID: ${selectedBarberId}`);
        if (servicesRes.error) throw new Error(`Servicios: ${servicesRes.error.message}`);
        if (availabilityRes.error) throw new Error(`Disponibilidad: ${availabilityRes.error.message}`);

        barberInfo = barberRes.data;
        barberServices = servicesRes.data || [];
        barberAvailability = availabilityRes.data || [];

        if (barberNameTitle) barberNameTitle.textContent = `Reservar Cita con ${barberInfo.nombre || 'Barbero Profesional'}`;
        if (barberInfo.foto_perfil_url && barberImageHeader && barberImageElement) {
            barberImageElement.src = barberInfo.foto_perfil_url;
            barberImageElement.alt = `Foto de ${barberInfo.nombre}`;
            barberImageHeader.style.display = 'block';
        }


        populateServices();
        if (bookingStatus) bookingStatus.textContent = ""; // Limpiar estado de carga
    } catch (error) {
        console.error('Error cargando datos para reserva:', error);
        if (barberNameTitle) barberNameTitle.textContent = "Error al cargar datos";
        if (bookingStatus) bookingStatus.textContent = `Error: ${error.message}`;
        disableForm();
    }
}

async function loadBookingsForDate(dateString) {
    if (!selectedBarberId || !supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('citas')
        .select('hora_inicio_cita, hora_fin_cita')
        .eq('barbero_id', selectedBarberId)
        .eq('fecha_cita', dateString);

    if (error) {
        console.error("Error cargando citas existentes:", error);
        barberBookings = [];
    } else {
        barberBookings = data || [];
    }
}

// --- LÓGICA DE TIEMPO Y DISPONIBILIDAD (adaptada) ---
async function updateAvailableTimes() {
    const selectedDateValue = datePicker ? datePicker.value : null;
    if (!selectedDateValue || !selectedBarberId || !timeSelect) {
        if (timeSelect) {
            timeSelect.innerHTML = '<option value="">-- Elige una fecha primero --</option>';
            timeSelect.disabled = true;
        }
        return;
    }

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Cargando horas...</option>';

    await loadBookingsForDate(selectedDateValue);

    const dateObj = new Date(selectedDateValue + 'T00:00:00Z'); // Usar Z para UTC explícito
    const dayOfWeek = dateObj.getUTCDay(); // 0 (Domingo) a 6 (Sábado)

    const availableSlots = [];
    const availabilityForDay = barberAvailability.filter(a => a.dia_semana === dayOfWeek);
    
    const selectedServiceId = serviceSelect ? serviceSelect.value : null;
    const serviceData = barberServices.find(s => s.id === selectedServiceId);
    const slotDuration = serviceData?.servicios_maestro?.duracion_estimada_min || 30;


    availabilityForDay.forEach(block => {
        let currentTime = parseTime(block.hora_inicio);
        const blockEndTime = parseTime(block.hora_fin);

        while (currentTime < blockEndTime) {
            const slotStartTime = formatTime(currentTime);
            const potentialSlotEndTime = addMinutes(currentTime, slotDuration);

            if (potentialSlotEndTime <= blockEndTime && !isSlotBooked(slotStartTime, slotDuration)) {
                availableSlots.push(slotStartTime);
            }
            currentTime = addMinutes(currentTime, slotDuration);
        }
    });
    populateTimeSelect(availableSlots);
}

function parseTime(timeString) { 
    const parts = timeString.split(':').map(Number);
    const date = new Date();
    date.setUTCHours(parts[0], parts[1], parts[2] || 0, 0); 
    return date;
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

function formatTime(date) { 
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function isSlotBooked(slotStartTimeString, duration) {
    const newSlotStart = parseTime(slotStartTimeString);
    const newSlotEnd = addMinutes(newSlotStart, duration);

    return barberBookings.some(booking => {
        const existingStart = parseTime(booking.hora_inicio_cita);
        const existingEnd = parseTime(booking.hora_fin_cita);
        return newSlotStart < existingEnd && newSlotEnd > existingStart;
    });
}


// --- POPULATE UI ---
function populateServices() {
    if (!serviceSelect) return;
    serviceSelect.innerHTML = '<option value="" disabled selected>-- Elige un servicio --</option>';
    if (barberServices.length === 0) {
        serviceSelect.innerHTML = '<option value="" disabled selected>-- No hay servicios disponibles --</option>';
        return;
    }
    barberServices.forEach(bs => {
        const name = bs.nombre_personalizado || bs.servicios_maestro?.nombre || 'Servicio sin nombre';
        const price = bs.precio !== null ? bs.precio : 'N/A';
        const option = document.createElement('option');
        option.value = bs.id; 
        option.textContent = `${name} ($${price})`;
        option.dataset.price = price;
        option.dataset.name = name;
        serviceSelect.appendChild(option);
    });
}

function populateTimeSelect(slots) {
    if (!timeSelect) return;
    timeSelect.innerHTML = slots.length > 0 ?
        '<option value="" disabled selected>-- Elige una hora --</option>' :
        '<option value="" disabled>-- No hay horas disponibles --</option>';

    slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
    });
    timeSelect.disabled = slots.length === 0;
}

function updateSummaryView() {
    const clienteNombre = clienteNombreInput ? clienteNombreInput.value : '';
    const clienteApellido = clienteApellidoInput ? clienteApellidoInput.value : '';
    const clienteTelefono = clienteTelefonoInput ? clienteTelefonoInput.value : '';

    const selectedServiceOption = serviceSelect && serviceSelect.selectedIndex !== -1 ? serviceSelect.options[serviceSelect.selectedIndex] : null;
    const serviceName = selectedServiceOption ? selectedServiceOption.dataset.name : 'N/D';
    const servicePrice = selectedServiceOption ? selectedServiceOption.dataset.price : 'N/D';
    
    const dateValue = datePicker ? datePicker.value : '';
    let formattedDate = 'N/D';
    if (dateValue) {
        try {
            const dateObj = new Date(dateValue + 'T00:00:00Z');
            formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        } catch (e) { formattedDate = dateValue; }
    }
    
    const timeValue = timeSelect ? timeSelect.value : '';

    if (summaryBarberName) summaryBarberName.textContent = barberInfo.nombre || 'Barbero';
    if (summaryClientName) summaryClientName.textContent = `${clienteNombre} ${clienteApellido}`.trim() || 'N/D';
    if (summaryClientPhone) summaryClientPhone.textContent = clienteTelefono || 'N/D';
    if (summaryService) summaryService.textContent = serviceName;
    if (summaryPrice) summaryPrice.textContent = servicePrice;
    if (summaryDate) summaryDate.textContent = formattedDate;
    if (summaryTime) summaryTime.textContent = timeValue || 'N/D';
}


// --- LÓGICA DEL FORMULARIO MULTIPASOS ---
function updateProgressBar() {
    progressBarSteps.forEach((stepCircle, index) => {
        stepCircle.classList.remove('active', 'completed');
        if (index < currentStep) {
            stepCircle.classList.add('completed');
        } else if (index === currentStep) {
            stepCircle.classList.add('active');
        }
    });
    progressBarLines.forEach((line, index) => {
        if (index < currentStep) {
            line.classList.add('active');
        } else {
            line.classList.remove('active');
        }
    });
}

function showStep(stepIndex) {
    steps.forEach((step, index) => {
        step.classList.remove('active-step', 'inactive-step-left');
        if (index === stepIndex) {
            step.classList.add('active-step');
        }
    });
    currentStep = stepIndex; 
    updateProgressBar();
}

function validateStep(stepIndex) {
    let isValid = true;
    if (!steps[stepIndex]) return false; // Si el paso no existe
    const currentStepInputs = steps[stepIndex].querySelectorAll('input[required], select[required]');
    currentStepInputs.forEach(input => {
        input.classList.remove('invalid');
        if (!input.value || (input.type === 'select-one' && input.value === "")) {
            isValid = false;
            input.classList.add('invalid');
        }
    });
    return isValid;
}

function setupMultiStepFormEventListeners() {
    if (nextButtons) {
        nextButtons.forEach(button => {
            // Asegurarse de que 'button' no es null, aunque querySelectorAll no debería incluir nulls.
            if (button) { 
                button.addEventListener('click', () => {
                    if (validateStep(currentStep)) {
                        if (currentStep < steps.length - 1) {
                            if (currentStep === 0) { 
                                updateAvailableTimes(); 
                            }
                             if (currentStep === 2) { 
                                updateSummaryView();
                            }
                            steps[currentStep].classList.add('inactive-step-left');
                            currentStep++;
                            setTimeout(() => showStep(currentStep), 150);
                        }
                    }
                });
            }
        });
    }

    if (prevButtons) {
        prevButtons.forEach(button => {
            if (button) {
                button.addEventListener('click', () => {
                    if (currentStep > 0) {
                        steps[currentStep].classList.remove('active-step');
                        currentStep--;
                        showStep(currentStep);
                    }
                });
            }
        });
    }

    // Verifica que submitWhatsappButton exista antes de añadir el listener
    if (submitWhatsappButton) {
        submitWhatsappButton.addEventListener('click', handleBookingSubmit);
    } else {
        console.warn("Elemento con ID 'submitWhatsapp' no encontrado. Listener no añadido.");
    }

    // Verifica serviceSelect y datePicker antes de añadir listeners
    if (serviceSelect) {
        serviceSelect.addEventListener('change', () => {
            if (datePicker && datePicker.value) updateAvailableTimes();
        });
    } else {
        console.warn("Elemento con ID 'service-select' no encontrado. Listener no añadido.");
    }

    if (datePicker) {
        datePicker.addEventListener('change', updateAvailableTimes);
    } else {
        console.warn("Elemento con ID 'date-picker' no encontrado. Listener no añadido.");
    }

    showStep(currentStep); 
}


async function handleBookingSubmit() {
    // Asegurarse que el paso actual (resumen) es válido.
    // Aunque el resumen usualmente no tiene inputs 'required', es buena práctica validarlo.
    if (!validateStep(currentStep)) { 
         if (bookingStatus) bookingStatus.textContent = 'Por favor, revisa los datos.';
        return;
    }

    if (bookingStatus) bookingStatus.textContent = 'Procesando tu reserva...';
    if (whatsappLinkContainer) whatsappLinkContainer.innerHTML = '';

    const cliente_nombre = clienteNombreInput ? clienteNombreInput.value : '';
    const cliente_apellido = clienteApellidoInput ? clienteApellidoInput.value : ''; // Opcional
    const cliente_telefono = clienteTelefonoInput ? clienteTelefonoInput.value : '';
    const servicio_reservado_id = serviceSelect ? serviceSelect.value : '';
    const fecha_cita = datePicker ? datePicker.value : '';
    const hora_inicio_cita = timeSelect ? timeSelect.value : '';

    if (!cliente_nombre || !servicio_reservado_id || !fecha_cita || !hora_inicio_cita || !cliente_telefono) {
        if (bookingStatus) bookingStatus.textContent = 'Error: Faltan datos para la reserva.';
        console.error('Datos de reserva incompletos:', { cliente_nombre, servicio_reservado_id, fecha_cita, hora_inicio_cita, cliente_telefono });
        return;
    }

    const selectedServiceData = barberServices.find(bs => bs.id === servicio_reservado_id);
    if (!selectedServiceData) {
        if (bookingStatus) bookingStatus.textContent = 'Error: Servicio no válido seleccionado.';
        return;
    }

    const duracion = selectedServiceData.servicios_maestro?.duracion_estimada_min || 30; 
    const hora_fin_cita = formatTime(addMinutes(parseTime(hora_inicio_cita), duracion));
    const precio_final = selectedServiceData.precio;

    try {
        if (!supabaseClient) throw new Error("Supabase client no está inicializado.");
        const { data: citaData, error } = await supabaseClient
            .from('citas')
            .insert({
                barbero_id: selectedBarberId,
                servicio_reservado_id: servicio_reservado_id,
                cliente_nombre: cliente_nombre,
                cliente_apellido: cliente_apellido,
                cliente_telefono: cliente_telefono,
                fecha_cita: fecha_cita,
                hora_inicio_cita: hora_inicio_cita,
                hora_fin_cita: hora_fin_cita,
                precio_final: precio_final,
                estado: 'pendiente' 
            })
            .select()
            .single();

        if (error) throw error;

        console.log("Cita guardada en Supabase:", citaData);
        if (bookingStatus) bookingStatus.textContent = '¡Cita pre-reservada! Confirma por WhatsApp.';
        
        const barberPhone = barberInfo.telefono;
        if (!barberPhone) {
            if (whatsappLinkContainer) whatsappLinkContainer.innerHTML = `<p style="color: var(--danger-color);">Error: El barbero no ha configurado un número de WhatsApp.</p>`;
            return;
        }

        const serviceNameForMsg = selectedServiceData.nombre_personalizado || selectedServiceData.servicios_maestro?.nombre;
        const fullNameForMsg = `${cliente_nombre} ${cliente_apellido}`.trim();
        let formattedDateForMsg = fecha_cita;
        try {
            const dateObj = new Date(fecha_cita + 'T00:00:00Z');
            formattedDateForMsg = dateObj.toLocaleDateString('es-ES', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'});
        } catch(e) { /* usa raw date */ }


        const message = `¡Hola ${barberInfo.nombre}! Quiero confirmar mi cita:
        \nCliente: ${fullNameForMsg}
        \nTeléfono: ${cliente_telefono || 'No proporcionado'}
        \nServicio: ${serviceNameForMsg}
        \nFecha: ${formattedDateForMsg}
        \nHora: ${hora_inicio_cita}
        \nID Cita: ${citaData.id} (para referencia)
        \n¡Gracias!`;

        const cleanPhone = barberPhone.replace(/[\s+()-]/g, '');
        const encodedMessage = encodeURIComponent(message);
        const link = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

        if (whatsappLinkContainer) whatsappLinkContainer.innerHTML = `<a href="${link}" target="_blank" class="style-button whatsapp-confirm-button">✅ Confirmar Cita por WhatsApp</a>`;
        
        if (clienteNombreInput) clienteNombreInput.value = '';
        if (clienteApellidoInput) clienteApellidoInput.value = '';
        if (clienteTelefonoInput) clienteTelefonoInput.value = '';
        // Considerar resetear más campos o volver al primer paso si se desea
        // currentStep = 0;
        // showStep(currentStep);
        // if (serviceSelect) serviceSelect.value = "";
        // if (datePicker) datePicker.value = "";
        // if (timeSelect) {
        //     timeSelect.innerHTML = '<option value="">-- Elige una fecha primero --</option>';
        //     timeSelect.disabled = true;
        // }

    } catch (error) {
        console.error("Error al guardar o procesar la cita:", error);
        if (bookingStatus) bookingStatus.textContent = `Error al procesar la cita: ${error.message || 'Intente de nuevo.'}`;
        if (error.details && error.details.includes("citas_barbero_id_fecha_cita_hora_inicio_cita_key")) {
             if (bookingStatus) bookingStatus.textContent = "Error: Este horario ya ha sido reservado o hay un conflicto. Por favor, elige otra hora.";
        }
    }
}

// --- INICIAR ---
// Asegurarse de que initSupabaseInBooking se llama después de que el DOM esté completamente cargado.
document.addEventListener('DOMContentLoaded', initSupabaseInBooking);
