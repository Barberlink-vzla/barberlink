// js/reserva.js
document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabaseClient === 'undefined') {
        console.error("Reserva Error: supabaseClient no está definido.");
        return;
    }
    console.log("Módulo de reserva iniciado correctamente. ✅");

    // --- State Management ---
    let currentStep = 1;
    let barberId = null;
    let barberData = null;
    let barberClients = [];
    let selectedService = null;
    let selectedServiceDuration = null;
    let selectedServiceType = null; // 'domicilio' o 'studio'
    let availableSlots = [];

    // --- DOM Elements ---
    const form = document.getElementById('barberBookingForm');
    const steps = document.querySelectorAll('.form-step');
    const progressBarSteps = document.querySelectorAll('.progress-bar-step');
    
    // Step 1: Tipo de servicio (Modal)
    const serviceTypeModalOverlay = document.getElementById('service-type-modal-overlay');
    const studioButton = document.getElementById('select-studio-btn');
    const domicilioButton = document.getElementById('select-domicilio-btn');

    // Step 2: Cliente y Servicio
    const clientSearchInput = document.getElementById('client-search');
    const clientPhoneInput = document.getElementById('client-phone');
    const clientSuggestions = document.getElementById('client-suggestions');
    const serviceSelect = document.getElementById('service-select');
    
    // Step 3: Fecha y Hora
    const dateInput = document.getElementById('booking-date');
    const timeSelect = document.getElementById('time-select');
    
    // Step 4: Resumen
    const bookingSummary = document.getElementById('booking-summary');

    // UI Elements
    const barberNameTitle = document.getElementById('barber-name-title');
    const barberProfileImg = document.getElementById('barber-profile-img');
    const statusMessage = document.getElementById('booking-status');
    const successMessageContainer = document.getElementById('booking-success-message');
    const whatsappLinkContainer = document.getElementById('whatsapp-link-container');


    // =================================================================================
    // INICIALIZACIÓN Y CARGA DE DATOS
    // =================================================================================

    /**
     * Obtiene el ID del barbero desde la URL.
     * Ejemplo URL: /reserva.html?barberId=uuid-del-barbero
     */
    function getBarberIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('barberId');
        if (!id) {
            console.error("No se encontró el ID del barbero en la URL.");
            document.body.innerHTML = '<h1>Error: Falta el identificador del barbero.</h1>';
        }
        return id;
    }

    /**
     * Inicia el modal para que el usuario elija el tipo de servicio.
     */
    function initServiceTypeModal() {
        if (!serviceTypeModalOverlay) return;

        serviceTypeModalOverlay.classList.add('active');

        const selectType = (type) => {
            selectedServiceType = type;
            console.log(`Tipo de servicio seleccionado: ${selectedServiceType}`);
            serviceTypeModalOverlay.classList.remove('active');
            navigateToStep(1); // Mover al primer paso real del formulario
            fetchServices(); // Cargar los servicios correspondientes
        };

        studioButton.onclick = () => selectType('studio');
        domicilioButton.onclick = () => selectType('domicilio');
    }


    /**
     * Carga los datos del perfil del barbero (nombre, imagen, etc.).
     */
    async function fetchBarberData() {
        if (!barberId) return;

        const { data, error } = await supabaseClient
            .from('barberos')
            .select('nombre, apellido, foto_perfil_url, telefono')
            .eq('id', barberId)
            .single();

        if (error) {
            console.error('Error al cargar datos del barbero:', error);
            barberNameTitle.textContent = "Barbero no encontrado";
            return;
        }

        barberData = data;
        barberNameTitle.textContent = `Reservar con ${data.nombre} ${data.apellido || ''}`;
        if (data.foto_perfil_url) {
            barberProfileImg.src = data.foto_perfil_url;
        }
    }

    /**
     * Carga los servicios (de estudio o a domicilio) que ofrece el barbero.
     */
    async function fetchServices() {
        if (!barberId || !selectedServiceType) return;
        
        const tableName = selectedServiceType === 'studio' ? 'servicios_barbero' : 'servicios_domicilio';

        const { data, error } = await supabaseClient
            .from(tableName)
            .select('*')
            .eq('barbero_id', barberId)
            .order('nombre', { ascending: true });

        if (error) {
            console.error(`Error al cargar servicios de ${selectedServiceType}:`, error);
            return;
        }

        serviceSelect.innerHTML = '<option value="">Selecciona un servicio...</option>';
        data.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            option.textContent = `${service.nombre} - $${service.precio} (${service.duracion_minutos} min)`;
            option.dataset.serviceData = JSON.stringify(service);
            serviceSelect.appendChild(option);
        });
    }

    /**
     * Carga la disponibilidad del barbero para una fecha específica.
     */
    async function fetchAvailability(date) {
        if (!barberId || !selectedService) {
            timeSelect.innerHTML = '<option value="">Selecciona un servicio primero</option>';
            return;
        }

        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="">Cargando horarios...</option>';

        const { data, error } = await supabaseClient.rpc('get_available_slots', {
            barber_uuid: barberId,
            booking_date: date,
            service_duration: selectedService.duracion_minutos
        });

        if (error) {
            console.error('Error al cargar disponibilidad:', error);
            timeSelect.innerHTML = `<option value="">Error al cargar horarios</option>`;
            return;
        }

        availableSlots = data;
        timeSelect.innerHTML = '<option value="">Selecciona una hora</option>';
        if (data.length === 0) {
            timeSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
            return;
        }

        data.forEach(slot => {
            const option = document.createElement('option');
            // Formatear la hora para mostrarla (ej: 14:00)
            option.value = slot.start_time;
            option.textContent = new Date(`1970-01-01T${slot.start_time}`).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
            timeSelect.appendChild(option);
        });
        timeSelect.disabled = false;
    }


    // =================================================================================
    // MANEJO DEL FORMULARIO Y NAVEGACIÓN
    // =================================================================================

    function navigateToStep(stepNumber) {
        currentStep = stepNumber;
        steps.forEach(step => step.style.display = 'none');
        document.getElementById(`step-${stepNumber}`).style.display = 'block';

        progressBarSteps.forEach((step, index) => {
            if (index < stepNumber -1) {
                step.classList.add('completed');
                step.classList.remove('active');
            } else if (index === stepNumber -1) {
                step.classList.add('active');
                step.classList.remove('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
        
        if (stepNumber === 4) {
             updateBookingSummary();
        }
    }

    function updateBookingSummary() {
        if (!selectedService || !dateInput.value || !timeSelect.value) {
            bookingSummary.innerHTML = "<p>Por favor, completa todos los pasos anteriores.</p>";
            return;
        }

        const selectedDate = new Date(`${dateInput.value}T00:00:00-04:00`); // Asegurar zona horaria local
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = selectedDate.toLocaleDateString('es-VE', dateOptions);

        const selectedTime = new Date(`1970-01-01T${timeSelect.value}`);
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
        const formattedTime = selectedTime.toLocaleTimeString('es-VE', timeOptions);

        bookingSummary.innerHTML = `
            <h4>Resumen de la Cita:</h4>
            <p><strong>Cliente:</strong> ${clientSearchInput.value.trim()}</p>
            <p><strong>Teléfono:</strong> ${clientPhoneInput.value.trim()}</p>
            <p><strong>Servicio:</strong> ${selectedService.nombre}</p>
            <p><strong>Tipo:</strong> ${selectedServiceType === 'studio' ? 'En el estudio' : 'A domicilio'}</p>
            <p><strong>Fecha:</strong> ${formattedDate}</p>
            <p><strong>Hora:</strong> ${formattedTime}</p>
            <p><strong>Precio:</strong> $${selectedService.precio}</p>
        `;
    }

    // =================================================================================
    // LÓGICA DE LA RESERVA (NUEVO MÉTODO)
    // =================================================================================

    /**
     * Maneja el envío del formulario.
     * Reúne toda la información y la envía a la Edge Function 'create-booking'.
     */
    async function handleBookingSubmit(e) {
        e.preventDefault();
        statusMessage.textContent = 'Procesando tu reserva...';
        statusMessage.style.color = 'var(--text-color)';

        // --- Validación ---
        if (!barberId || !selectedService || !dateInput.value || !timeSelect.value || !clientSearchInput.value || !clientPhoneInput.value) {
            statusMessage.textContent = 'Error: Por favor, completa todos los campos.';
            statusMessage.style.color = 'var(--danger-color)';
            return;
        }

        try {
            const startTime = timeSelect.value;
            const selectedSlot = availableSlots.find(slot => slot.start_time === startTime);
            if (!selectedSlot) {
                throw new Error("La hora seleccionada ya no está disponible. Por favor, elige otra.");
            }
            const endTime = selectedSlot.end_time;

            // 1. Construir el objeto payload para la Edge Function.
            //    Este objeto debe coincidir con la interfaz `BookingPayload` en index.ts
            const bookingPayload = {
                barberId: barberId,
                clientName: clientSearchInput.value.trim(),
                clientPhone: clientPhoneInput.value.trim(),
                serviceId: selectedService.id,
                bookingDate: dateInput.value, // Formato AAAA-MM-DD
                startTime: startTime,         // Formato HH:MM:SS
                endTime: endTime,             // Formato HH:MM:SS
                finalPrice: selectedService.precio,
                serviceType: selectedServiceType
            };

            // 2. Invocar la Edge Function con el payload.
            //    Esta es la única interacción con Supabase para crear la reserva.
            const { data: bookingResult, error: functionError } = await supabaseClient.functions.invoke('create-booking', {
                body: bookingPayload
            });

            // 3. Manejar la respuesta de la función.
            if (functionError) {
                // El error puede venir de la función misma (ej: un 'throw new Error(...)')
                const errorMessage = functionError.context?.errorMessage || `No se pudo crear la cita: ${functionError.message}`;
                throw new Error(errorMessage);
            }

            // 4. Éxito: Mostrar la pantalla de confirmación.
            document.getElementById('booking-container').style.display = 'none';
            successMessageContainer.style.display = 'block';
            statusMessage.textContent = '';
            
            // Generar el enlace de WhatsApp con los datos devueltos por la función
            generateWhatsAppLink(bookingResult.bookingData);

        } catch (error) {
            console.error('Error en el proceso de reserva:', error);
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.style.color = 'var(--danger-color)';
        }
    }

    /**
     * Genera y muestra un enlace de WhatsApp para que el cliente confirme la cita.
     */
    function generateWhatsAppLink(bookingData) {
        if (!barberData || !barberData.telefono) {
            whatsappLinkContainer.innerHTML = '<p>No se pudo generar el enlace de WhatsApp (teléfono del barbero no disponible).</p>';
            return;
        }

        const clientName = clientSearchInput.value.trim();
        const serviceName = selectedService.nombre;
        const date = new Date(`${bookingData.fecha_cita}T${bookingData.hora_inicio_cita}`).toLocaleDateString('es-VE', { dateStyle: 'long' });
        const time = new Date(`1970-01-01T${bookingData.hora_inicio_cita}`).toLocaleTimeString('es-VE', { timeStyle: 'short' });

        const message = `¡Hola ${barberData.nombre}! Soy ${clientName}. Acabo de agendar una cita para un corte de '${serviceName}' el día ${date} a las ${time}. ¡Gracias!`;
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${barberData.telefono}&text=${encodeURIComponent(message)}`;

        whatsappLinkContainer.innerHTML = `<a href="${whatsappUrl}" target="_blank" class="style-button whatsapp-button"><i class="fab fa-whatsapp"></i> Confirmar por WhatsApp</a>`;
    }


    // =================================================================================
    // LISTENERS DE EVENTOS
    // =================================================================================

    form.addEventListener('submit', handleBookingSubmit);

    // Navegación entre pasos
    document.getElementById('next-step-1').addEventListener('click', () => navigateToStep(2));
    document.getElementById('prev-step-2').addEventListener('click', () => navigateToStep(1));
    document.getElementById('next-step-2').addEventListener('click', () => navigateToStep(3));
    document.getElementById('prev-step-3').addEventListener('click', () => navigateToStep(2));
    document.getElementById('next-step-3').addEventListener('click', () => navigateToStep(4));
    document.getElementById('prev-step-4').addEventListener('click', () => navigateToStep(3));

    dateInput.addEventListener('change', () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;

        if (dateInput.value < todayString) {
            alert("No puedes seleccionar una fecha pasada.");
            dateInput.value = '';
            timeSelect.innerHTML = '<option value="">Selecciona una fecha válida</option>';
            timeSelect.disabled = true;
            return;
        }
        fetchAvailability(dateInput.value);
    });

    serviceSelect.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        if (!selectedOption.dataset.serviceData) {
             selectedService = null;
             return;
        }
        
        selectedService = JSON.parse(selectedOption.dataset.serviceData);

        if (dateInput.value) {
            fetchAvailability(dateInput.value);
        }
    });

    // --- Carga Inicial ---
    barberId = getBarberIdFromURL();
    if(barberId) {
        initServiceTypeModal();
        fetchBarberData();
    }
});
