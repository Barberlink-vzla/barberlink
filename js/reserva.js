// EN: js/reserva.js (Pega esto al inicio del script)

const currencyManager = {
    rate: 0,
    markup: 0,
    finalRate: 0,
    primaryCurrency: 'USD',
    secondaryCurrency: 'VES',

    async init(supabaseClient, barberData) {
        this.markup = barberData.porcentaje_markup_tasa || 0;
        this.primaryCurrency = barberData.moneda_primaria || 'USD';
        this.secondaryCurrency = barberData.moneda_secundaria || 'VES';

        try {
            const { data, error } = await supabaseClient.functions.invoke('get-bcv-rate');
            if (error) throw error;
            this.rate = data.rate || 0;
            this.finalRate = this.rate * (1 + this.markup / 100);
            console.log(`CurrencyManager en Reserva: Tasa Final=${this.finalRate.toFixed(2)}`);
        } catch (error) {
            console.error("Error al obtener la tasa de cambio en reserva:", error);
            this.rate = 0;
            this.finalRate = 0;
        }
    },

    formatPrice(usdAmount) {
        if (typeof usdAmount !== 'number') usdAmount = 0;
        const primaryFormatted = `${this.primaryCurrency} ${usdAmount.toFixed(2)}`;
        if (this.finalRate > 0) {
            const secondaryAmount = usdAmount * this.finalRate;
            const secondaryFormatted = `${this.secondaryCurrency} ${secondaryAmount.toFixed(2)}`;
            return `${primaryFormatted} (${secondaryFormatted})`;
        }
        return primaryFormatted;
    }
};

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

    const getBarberIdFromURL = () => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('barber_id');
        if (!id) {
            console.error("No se encontró el 'barber_id' en la URL.");
            document.body.innerHTML = '<h1>Error: Falta el identificador del barbero en la URL.</h1>';
        }
        return id;
    };

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

   // EN: js/reserva.js
// REEMPLAZA tu función fetchBarberData actual con esta

    const fetchBarberData = async () => {
        if (!barberId) return;

        // 1. Añadimos los nuevos campos de moneda a la consulta
        const { data, error } = await supabaseClient
            .from('barberos')
            .select('nombre, telefono, foto_perfil_url, moneda_primaria, moneda_secundaria, porcentaje_markup_tasa') // <-- CAMPOS AÑADIDOS
            .eq('user_id', barberId)
            .single();

        if (error || !data) {
            console.error("Error fetching barber data:", error);
            barberNameTitle.textContent = "Barbero no encontrado";
            return;
        }

        barberData = data;

        // 2. INICIALIZAMOS el gestor de moneda con los datos del barbero
        await currencyManager.init(supabaseClient, barberData);

        // 3. El resto del código continúa como antes
        barberNameTitle.textContent = `Reservar con ${data.nombre}`;
        if (data.foto_perfil_url) {
            barberProfileImg.src = data.foto_perfil_url;
        }
    };
    
    const fetchServicesForBarber = async () => {
        if (!barberId || !selectedServiceType) return;
        const serviceTableName = 'barbero_servicios';
        console.log(`Cargando servicios desde la tabla correcta: ${serviceTableName}`);

        const [servicesResponse, clientsResponse] = await Promise.all([
            supabaseClient
                .from(serviceTableName)
                .select('*, servicios_maestro(id, nombre)')
                .eq('barbero_id', barberId),
            supabaseClient
                .from('clientes')
                .select('id, nombre, telefono')
                .eq('barbero_id', barberId)
        ]);

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

    const populateServiceSelect = (services) => {
        if (!services || services.length === 0) {
            serviceSelect.innerHTML = '<option>No hay servicios disponibles</option>';
            return;
        }
        serviceSelect.innerHTML = '<option value="" disabled selected>Selecciona un servicio...</option>';
        services.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            const serviceName = service.nombre_personalizado || service.servicios_maestro?.nombre || 'Servicio sin nombre';
            const servicePrice = service.precio || 0;
            const serviceDuration = service.duracion_minutos || 30;
            option.textContent = `${serviceName} - ${currencyManager.formatPrice(servicePrice)} (${serviceDuration} min)`;
            option.dataset.serviceData = JSON.stringify(service);
            serviceSelect.appendChild(option);
        });
    };

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

    // --- CAMBIO CLAVE: Obtener la moneda seleccionada ---
    const selectedCurrency = document.querySelector('input[name="payment_currency"]:checked').value;
    let priceText = '';
    
    if (selectedCurrency === 'USD') {
        priceText = `USD ${selectedService.precio.toFixed(2)}`;
    } else {
        const vesAmount = selectedService.precio * currencyManager.finalRate;
        priceText = `VES ${vesAmount.toFixed(2)}`;
    }
    // --- FIN DEL CAMBIO ---

    const serviceName = selectedService.nombre_personalizado || selectedService.nombre || 'Servicio';
    const date = new Date(dateInput.value + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const time = timeSelect.options[timeSelect.selectedIndex].textContent;
    const clientName = clientSearchInput.value;
    const serviceLocation = selectedServiceType === 'domicilio' ? 'A Domicilio' : 'En el Estudio';

    bookingSummary.innerHTML = `
        <p><strong>Barbero:</strong> ${barberData.nombre}</p>
        <p><strong>Modalidad:</strong> ${serviceLocation}</p>
        <p><strong>Servicio:</strong> ${serviceName}</p>
        <p><strong>Precio a Pagar:</strong> ${priceText}</p> <p><strong>Fecha:</strong> ${date}</p>
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

            // Validación extra de slot y endTime
            if (!selectedSlot) {
                alert("El horario seleccionado ya no está disponible. Por favor, recarga o elige otro.");
                if (submitButton) submitButton.disabled = false;
                return;
            }
            // --- CAMBIO CLAVE: Usar el nombre correcto del campo de fin ---
            const endTime = selectedSlot.hora_fin || selectedSlot.end_time || selectedSlot.hora_fin_cita;

            console.log("Slot seleccionado:", selectedSlot, "Campos:", Object.keys(selectedSlot));
            console.log("Valor de endTime:", endTime);

            if (!endTime) {
                alert("Error interno: el horario de fin no se pudo determinar. Por favor, selecciona otra hora.");
                if (submitButton) submitButton.disabled = false;
                return;
            }
            
             const selectedCurrency = document.querySelector('input[name="payment_currency"]:checked').value;
    let finalAmount = 0;
    
    if (selectedCurrency === 'USD') {
        finalAmount = selectedService.precio;
    } else {
        finalAmount = selectedService.precio * currencyManager.finalRate;
    }

            const bookingPayload = {
                barberId: barberId,
                clientName: clientSearchInput.value.trim(),
                clientPhone: clientPhoneInput.value.trim(),
                serviceId: selectedService.id,
                bookingDate: dateInput.value,
                startTime: startTime,
                endTime: endTime,
                  monto: finalAmount, // <-- Columna renombrada
        moneda: selectedCurrency, // <-- Nueva columna
                finalPrice: selectedService.precio,
                serviceType: selectedServiceType,
                estimatedDuration: selectedService.duracion_minutos 
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
