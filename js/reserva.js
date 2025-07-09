// js/reserva.js
document.addEventListener('DOMContentLoaded', () => {
    // Verificación inicial de que el cliente de Supabase está disponible.
    if (typeof supabaseClient === 'undefined') {
        console.error("Reserva Error: supabaseClient no está definido. Asegúrate de que supabaseClient.js se cargue primero.");
        document.body.innerHTML = '<h1>Error Crítico de Configuración</h1>';
        return;
    }
    console.log("Módulo de reserva iniciado correctamente. ✅");

    // --- ESTADO GLOBAL DE LA RESERVA ---
    let currentStep = 1;
    let barberId = null;
    let barberData = null;
    let barberClients = [];
    let selectedClient = null;
    let selectedService = null;
    let selectedServiceType = null; // 'studio' o 'domicilio'
    let availableSlots = [];

    // --- ELEMENTOS DEL DOM ---
    const form = document.getElementById('barberBookingForm');
    const steps = document.querySelectorAll('.form-step');
    const progressBarSteps = document.querySelectorAll('.progress-bar-step');
    
    // Contenedores principales
    const bookingContainer = document.getElementById('booking-container');
    const successMessageContainer = document.getElementById('booking-success-message');
    
    // Modal de selección de tipo de servicio
    const serviceTypeOverlay = document.getElementById('service-type-overlay');
    const serviceTypeButtons = document.querySelectorAll('.service-type-btn');

    // Campos del formulario
    const serviceSelect = document.getElementById('service-select');
    const dateInput = document.getElementById('booking-date');
    const timeSelect = document.getElementById('time-select');
    const clientSearchInput = document.getElementById('cliente-search');
    const clientResultsList = document.getElementById('cliente-results-list');
    const clientPhoneInput = document.getElementById('cliente_telefono');
    
    // UI y Mensajes
    const barberNameTitle = document.getElementById('barber-name-title');
    const barberProfileImg = document.getElementById('barber-profile-img');
    const bookingSummary = document.getElementById('booking-summary');
    const statusMessage = document.getElementById('booking-status');
    const whatsappLinkContainer = document.getElementById('whatsapp-link-container');

    // =================================================================================
    // INICIALIZACIÓN Y CARGA DE DATOS
    // =================================================================================

    /**
     * Obtiene el ID del barbero desde los parámetros de la URL.
     */
    const getBarberIdFromURL = () => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('barber_id');
        if (!id) {
            console.error("No se encontró el 'barber_id' en la URL.");
            document.body.innerHTML = '<h1>Error: Falta el identificador del barbero en la URL.</h1>';
        }
        return id;
    };

    /**
     * Inicia el modal para que el usuario elija el tipo de servicio.
     */
    const initServiceTypeModal = () => {
        if (!serviceTypeOverlay) return;

        serviceTypeOverlay.classList.add('active');

        serviceTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                selectedServiceType = button.dataset.type;
                console.log(`Tipo de servicio seleccionado: ${selectedServiceType}`);
                
                serviceTypeOverlay.classList.remove('active');
                
                if (bookingContainer) {
                    bookingContainer.classList.remove('hidden');
                }
                
                fetchServicesForBarber();
            });
        });
    };

    /**
     * Carga el perfil del barbero (nombre, foto, teléfono).
     */
    const fetchBarberData = async () => {
        if (!barberId) return;

        // CORRECCIÓN: Se eliminó la columna "apellido" que no existía.
        const { data, error } = await supabaseClient
            .from('barberos')
            .select('nombre, telefono, foto_perfil_url')
            .eq('user_id', barberId)
            .single();

        if (error || !data) {
            // El error 'column barberos.apellido does not exist' aparecerá aquí.
            console.error("Error fetching barber data:", error);
            barberNameTitle.textContent = "Barbero no encontrado";
            return;
        }

        barberData = data;
        barberNameTitle.textContent = `Reservar con ${data.nombre}`;
        if (data.foto_perfil_url) {
            barberProfileImg.src = data.foto_perfil_url;
        }
    };

    /**
     * Carga los servicios del barbero y los clientes existentes.
     */
   // js/reserva.js

/**
 * Carga los servicios del barbero y los clientes existentes.
 */
const fetchServicesForBarber = async () => {
    if (!barberId || !selectedServiceType) return;
    
    // --- INICIO DE LA CORRECCIÓN ---
    // Apuntamos siempre a la tabla correcta 'barbero_servicios'.
    const serviceTableName = 'barbero_servicios';
    console.log(`Cargando servicios desde la tabla correcta: ${serviceTableName}`);

    // Hacemos la consulta igual que en barberProfile.js para obtener el nombre del servicio
    // y también cargamos los clientes del barbero.
    const [servicesResponse, clientsResponse] = await Promise.all([
        supabaseClient
            .from(serviceTableName)
            .select('*, servicios_maestro(id, nombre)') // Incluimos el nombre desde la tabla maestra
            .eq('barbero_id', barberId),
        supabaseClient
            .from('clientes')
            .select('id, nombre, telefono')
            .eq('barbero_id', barberId)
    ]);
    // --- FIN DE LA CORRECCIÓN ---


    if (servicesResponse.error) {
        console.error(`Error cargando servicios:`, servicesResponse.error);
        serviceSelect.innerHTML = '<option>Error al cargar servicios</option>';
        statusMessage.textContent = `Error al cargar servicios: ${servicesResponse.error.message}`;
        statusMessage.className = 'status-message error';
    } else {
        populateServiceSelect(servicesResponse.data);
    }

    if (clientsResponse.error) {
        console.error('Error fetching clients:', clientsResponse.error);
    } else {
        barberClients = clientsResponse.data || [];
    }
};

/**
 * Rellena el <select> de servicios con los datos obtenidos.
 */
const populateServiceSelect = (services) => {
    if (!services || services.length === 0) {
        serviceSelect.innerHTML = '<option>No hay servicios disponibles</option>';
        return;
    }
    
    serviceSelect.innerHTML = '<option value="" disabled selected>Selecciona un servicio...</option>';
    
    services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id; // ID de la tabla barbero_servicios
        
        // --- INICIO DE LA CORRECCIÓN ---
        // Leemos el nombre del servicio desde la relación con 'servicios_maestro'
        const serviceName = service.nombre_personalizado || service.servicios_maestro?.nombre || 'Servicio sin nombre';
        const servicePrice = service.precio || 0;
        const serviceDuration = service.duracion_minutos || 30;
        // --- FIN DE LA CORRECCIÓN ---

        option.textContent = `${serviceName} - $${servicePrice} (${serviceDuration} min)`;
        option.dataset.serviceData = JSON.stringify(service);
        serviceSelect.appendChild(option);
    });
};

    /**
     * Busca los horarios disponibles para una fecha y duración de servicio.
     */
    const fetchAvailability = async (date) => {
        if (!barberId || !date || !selectedService?.duracion_minutos) {
            timeSelect.disabled = true;
            timeSelect.innerHTML = '<option>Selecciona un servicio y fecha</option>';
            return;
        }

        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option>Cargando horarios...</option>';

        const { data, error } = await supabaseClient.rpc('get_available_slots_by_duration', {
            p_barber_id: barberId,
            p_booking_date: date,
            p_service_duration: `${selectedService.duracion_minutos} minutes`
        });

        if (error) {
            console.error('Error fetching availability:', error);
            timeSelect.innerHTML = '<option>Error al cargar horarios</option>';
            return;
        }

        availableSlots = data;
        populateTimeSelect(data);
    };
    
    /**
     * Rellena el <select> de horas con los datos de disponibilidad.
     */
    const populateTimeSelect = (slots) => {
        if (slots.length === 0) {
            timeSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
            return;
        }

        timeSelect.innerHTML = '<option value="" disabled selected>Selecciona una hora</option>';
        slots.forEach(slot => {
            const option = document.createElement('option');
            const timeParts = slot.start_time.split(':');
            const date = new Date();
            date.setHours(timeParts[0], timeParts[1], 0);
            
            const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            option.value = slot.start_time;
            option.textContent = formattedTime;
            timeSelect.appendChild(option);
        });
        timeSelect.disabled = false;
    };

    // --- (El resto del código, como la navegación y el envío del formulario, no necesita cambios) ---

    // =================================================================================
    // NAVEGACIÓN DEL FORMULARIO Y AUTOCOMPLETADO
    // =================================================================================
    const navigateToStep = (stepNumber) => {
        if (stepNumber > currentStep) {
            if (currentStep === 1 && !serviceSelect.value) { alert("Por favor, selecciona un servicio."); return; }
            if (currentStep === 2 && (!dateInput.value || !timeSelect.value)) { alert("Por favor, selecciona fecha y hora."); return; }
            if (currentStep === 3 && (!clientSearchInput.value.trim() || !clientPhoneInput.value.trim())) { alert("Por favor, completa tu nombre y teléfono."); return; }
        }
        currentStep = stepNumber;
        steps.forEach(step => step.classList.remove('active-step'));
        document.getElementById(`step-${currentStep}`)?.classList.add('active-step');
        progressBarSteps.forEach((pbStep, index) => {
            pbStep.classList.remove('active', 'completed');
            if (index + 1 < currentStep) pbStep.classList.add('completed');
            else if (index + 1 === currentStep) pbStep.classList.add('active');
        });
        if (currentStep === 4) updateBookingSummary();
    };
    
    const updateBookingSummary = () => {
        if (!selectedService) {
            bookingSummary.innerHTML = "<p>Error: No se ha seleccionado un servicio.</p>";
            return;
        }
        const serviceName = selectedService.nombre_personalizado || selectedService.nombre || 'Servicio';
        const date = new Date(dateInput.value + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const time = timeSelect.options[timeSelect.selectedIndex].textContent;
        const clientName = clientSearchInput.value;
        const serviceLocation = selectedServiceType === 'domicilio' ? 'A Domicilio' : 'En el Estudio';

        bookingSummary.innerHTML = `
            <p><strong>Barbero:</strong> ${barberData.nombre}</p>
            <p><strong>Modalidad:</strong> ${serviceLocation}</p>
            <p><strong>Servicio:</strong> ${serviceName}</p>
            <p><strong>Precio:</strong> $${selectedService.precio}</p>
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Hora:</strong> ${time}</p>
            <p><strong>Cliente:</strong> ${clientName.trim()}</p>
        `;
    };

    const showClientResults = (searchTerm) => {
        clientResultsList.innerHTML = '';
        if (!searchTerm) {
            clientResultsList.style.display = 'none';
            return;
        }
        const filteredClients = barberClients.filter(client =>
            `${client.nombre}`.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filteredClients.length > 0) {
            filteredClients.forEach(client => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = `${client.nombre}`;
                item.addEventListener('click', () => handleClientSelection(client));
                clientResultsList.appendChild(item);
            });
        } else {
            const item = document.createElement('div');
            item.className = 'autocomplete-item no-results';
            item.textContent = 'No se encontró el cliente. Continúa para registrarlo.';
            clientResultsList.appendChild(item);
        }
        clientResultsList.style.display = 'block';
    };

    const handleClientSelection = (client) => {
        selectedClient = client;
        clientSearchInput.value = `${client.nombre}`.trim();
        clientPhoneInput.value = client.telefono || '';
        clientResultsList.innerHTML = '';
        clientResultsList.style.display = 'none';
        clientPhoneInput.focus();
    };

    // =================================================================================
    // LÓGICA DE ENVÍO DE RESERVA
    // =================================================================================
    async function handleBookingSubmit(e) {
        e.preventDefault();
        if (!selectedService) {
            alert("Por favor selecciona un servicio antes de continuar.");
            return;
        }
        statusMessage.textContent = 'Procesando tu reserva...';
        statusMessage.className = 'status-message';
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        try {
            const startTime = timeSelect.value;
            const selectedSlot = availableSlots.find(slot => slot.start_time === startTime);
            if (!selectedSlot) {
                 throw new Error("El horario seleccionado ya no está disponible. Por favor, recarga o elige otro.");
            }
            const endTime = selectedSlot.end_time;
            const bookingPayload = {
    barberId: barberId,
    clientName: clientSearchInput.value.trim(),
    clientPhone: clientPhoneInput.value.trim(),
    serviceId: selectedService.id,
    bookingDate: dateInput.value,
    startTime: startTime,
    endTime: endTime,
    finalPrice: selectedService.precio,
    serviceType: selectedServiceType
};

console.log("bookingPayload enviado a create-booking:", JSON.stringify(bookingPayload, null, 2));
            const { data: bookingResult, error: functionError } = await supabaseClient.functions.invoke('create-booking', {
                body: bookingPayload
            });
            if (functionError) {
                const errorMessage = functionError.context?.errorMessage || `No se pudo crear la cita: ${functionError.message}`;
                throw new Error(errorMessage);
            }
            form.style.display = 'none';
            progressBarSteps.forEach(s => s.parentElement.style.display = 'none');
            successMessageContainer.style.display = 'block';
            statusMessage.textContent = '';
            generateWhatsAppLink(bookingResult.bookingData);
        } catch (error) {
            console.error("Error en el proceso de reserva:", error);
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.className = 'status-message error';
            if (submitButton) submitButton.disabled = false;
            alert(error.message + "\n\nSe recargarán los horarios disponibles.");
            fetchAvailability(dateInput.value);
        }
    }

    const generateWhatsAppLink = (bookingInfo) => {
        if (!barberData?.telefono) {
            whatsappLinkContainer.innerHTML = "<p>No se pudo generar enlace de WhatsApp (teléfono del barbero no configurado).</p>";
            return;
        }
        const barberPhone = barberData.telefono.replace(/\D/g, '');
        const serviceName = selectedService.nombre_personalizado || selectedService.nombre;
        const serviceLocation = selectedServiceType === 'domicilio' ? 'A Domicilio' : 'En el Estudio';
        const date = new Date(bookingInfo.fecha_cita + 'T12:00:00').toLocaleDateString('es-ES', {dateStyle: 'long'});
        const time = new Date(`1970-01-01T${bookingInfo.hora_inicio_cita}`).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
        const message = `¡Hola! Acabo de agendar una cita:\n\n*Modalidad:* ${serviceLocation}\n*Servicio:* ${serviceName}\n*Cliente:* ${bookingInfo.cliente_nombre}\n*Fecha:* ${date}\n*Hora:* ${time}\n\n¡Espero tu confirmación, gracias!`;
        const whatsappUrl = `https://wa.me/${barberPhone}?text=${encodeURIComponent(message)}`;
        whatsappLinkContainer.innerHTML = `
            <a href="${whatsappUrl}" target="_blank" class="style-button whatsapp-confirm-button">
                <i class="fab fa-whatsapp"></i> Enviar Confirmación por WhatsApp
            </a>`;
    };

    // =================================================================================
    // LISTENERS DE EVENTOS
    // =================================================================================
    form.addEventListener('submit', handleBookingSubmit);
    document.getElementById('next-step-1')?.addEventListener('click', () => navigateToStep(2));
    document.getElementById('prev-step-2')?.addEventListener('click', () => navigateToStep(1));
    document.getElementById('next-step-2')?.addEventListener('click', () => navigateToStep(3));
    document.getElementById('prev-step-3')?.addEventListener('click', () => navigateToStep(2));
    document.getElementById('next-step-3')?.addEventListener('click', () => navigateToStep(4));
    document.getElementById('prev-step-4')?.addEventListener('click', () => navigateToStep(3));

    dateInput.addEventListener('change', () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selectedDate = new Date(dateInput.value + 'T00:00:00');
        if (selectedDate < today) {
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
        if (!selectedOption.dataset.serviceData) return;
        selectedService = JSON.parse(selectedOption.dataset.serviceData);
        if (dateInput.value) {
            fetchAvailability(dateInput.value);
        }
    });

    clientSearchInput.addEventListener('input', () => {
        selectedClient = null;
        showClientResults(clientSearchInput.value);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            clientResultsList.style.display = 'none';
        }
    });

    // --- CARGA INICIAL ---
    barberId = getBarberIdFromURL();
    if(barberId) {
        initServiceTypeModal();
        fetchBarberData();
    }
});
