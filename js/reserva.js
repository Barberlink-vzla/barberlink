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
    if (typeof supabaseClient === 'undefined') {
        console.error("Reserva Error: supabaseClient no está definido.");
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
    const bookingCover = document.getElementById('booking-cover'); // <-- NUEVO
    const bookingContainer = document.getElementById('booking-container');
    const successMessageContainer = document.getElementById('booking-success-message');
    
    // Elementos de la portada
    const coverBarberProfileImg = document.getElementById('cover-barber-profile-img'); // <-- NUEVO
    const coverBarberName = document.getElementById('cover-barber-name'); // <-- NUEVO
    const showBookingModalBtn = document.getElementById('show-booking-modal-btn'); // <-- NUEVO

    // Modal de selección de tipo de servicio
    const serviceTypeOverlay = document.getElementById('service-type-overlay');
    const serviceTypeButtons = document.querySelectorAll('.service-type-btn');

    // Campos del formulario
    
    const dateInput = document.getElementById('booking-date');
    const timeSelect = document.getElementById('time-select');
    const clientSearchInput = document.getElementById('cliente-search');
    const clientResultsList = document.getElementById('cliente-results-list');
    const clientPhoneInput = document.getElementById('cliente_telefono');
    
    // UI y Mensajes
    const barberNameTitle = document.getElementById('barber-name-title');
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

    // MODIFICADO: Esta función ahora se llama al presionar el botón de la portada.
    const initServiceTypeModal = () => {
        if (!serviceTypeOverlay) return;

        // Ocultamos la portada y mostramos el modal
        bookingCover.classList.add('hidden');
        serviceTypeOverlay.classList.add('active');

        serviceTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                selectedServiceType = button.dataset.type;
                console.log(`Tipo de servicio seleccionado: ${selectedServiceType}`);
                
                serviceTypeOverlay.classList.remove('active');
                
                // Mostramos el contenedor del formulario de reserva
                if (bookingContainer) {
                    bookingContainer.style.display = 'block';
                }
                
                // Cargamos los servicios correspondientes
                fetchServicesForBarber();
            });
        });
    };

    const fetchBarberData = async () => {
        if (!barberId) return;

     // CÓDIGO CORRECTO
const { data, error } = await supabaseClient
    .from('barberos')
    .select('nombre, telefono, foto_perfil_url, moneda_primaria, moneda_secundaria, porcentaje_markup_tasa')
    .eq('id', barberId) // Busca por 'id'
    .single();

        if (error || !data) {
            console.error("Error fetching barber data:", error);
            coverBarberName.textContent = "Barbero no encontrado";
            barberNameTitle.textContent = "Barbero no encontrado";
            return;
        }

        barberData = data;
        await currencyManager.init(supabaseClient, barberData);

        // --- MODIFICADO: Poblamos los datos de la nueva portada ---
        coverBarberName.textContent = `Barbero: ${data.nombre}`;
        if (data.foto_perfil_url) {
            coverBarberProfileImg.src = data.foto_perfil_url;
        }

        // También poblamos el título del formulario para cuando se muestre
        barberNameTitle.textContent = `Reservar con ${data.nombre}`;
    };
    
    // EN: js/reserva.js
// REEMPLAZA TODA LA FUNCIÓN fetchServicesForBarber

// EN: js/reserva.js
// REEMPLAZA LA FUNCIÓN fetchServicesForBarber CON ESTA VERSIÓN

const fetchServicesForBarber = async () => {
    if (!barberId || !selectedServiceType) return;
    
    // El nombre de la tabla de servicios
    const serviceTableName = 'barbero_servicios';
    console.log(`Cargando servicios desde la tabla: ${serviceTableName}`);
    
    const carousel = document.getElementById('service-carousel');
    if (carousel) {
        carousel.innerHTML = '<p>Cargando servicios...</p>';
    }

    // Hacemos ambas peticiones en paralelo para mejorar la velocidad
    const [servicesResponse, clientsResponse] = await Promise.all([
        supabaseClient
            .from(serviceTableName)
            // AQUÍ LA CORRECCIÓN:
            // 1. Seleccionamos los datos del servicio y de la tabla 'servicios_maestro'.
            // 2. Usamos !inner para asegurar que solo traiga servicios de un barbero que exista.
            // 3. Filtramos por la columna 'user_id' de la tabla relacionada 'barberos'.
            // CÓDIGO CORRECTO
            .select('*, servicios_maestro(id, nombre)') // Ya no necesitamos unir con 'barberos'
            .eq('barbero_id', barberId), // Filtra directamente por el ID de perfil del barbero
            .eq('barberos.user_id', barberId), // La sintaxis correcta para filtrar en la tabla unida

        supabaseClient
            .from('clientes')
            .select('id, nombre, telefono')
            .eq('barbero_id', barberId) // Asumiendo que 'clientes' se relaciona con el user_id
    ]);

    // El resto de la función maneja los errores y puebla el carrusel
    if (servicesResponse.error) {
        console.error(`Error cargando servicios:`, servicesResponse.error);
        if (carousel) {
            carousel.innerHTML = `<p class="error-msg">Error al cargar los servicios. La relación en la base de datos parece correcta, pero algo falló.</p>`;
        }
        statusMessage.textContent = `Error al cargar servicios.`;
        statusMessage.className = 'status-message error';
    } else {
        populateServiceCarousel(servicesResponse.data);
    }

    if (clientsResponse.error) {
        console.error('Error fetching clients:', clientsResponse.error);
    } else {
        barberClients = clientsResponse.data || [];
    }
};



   const populateServiceCarousel = (services) => {
    const carousel = document.getElementById('service-carousel');
    const hiddenInput = document.getElementById('selected-service-id');
    if (!carousel || !hiddenInput) return;

    if (!services || services.length === 0) {
        carousel.innerHTML = '<p>No hay servicios disponibles.</p>';
        return;
    }

    // Limpiamos el carrusel
    carousel.innerHTML = '';
    
    // Poblamos con las nuevas tarjetas de servicio
    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.dataset.serviceId = service.id;
        card.dataset.serviceData = JSON.stringify(service);

        const serviceName = service.nombre_personalizado || service.servicios_maestro?.nombre || 'Servicio';
        const imageUrl = service.imagen_url || 'https://placehold.co/300x240/1a1a1a/7e8a9b?text=Servicio';
        
        card.innerHTML = `
            <img src="${imageUrl}" alt="${serviceName}" class="service-card-img">
            <div class="service-card-body">
                <p class="service-card-name">${serviceName}</p>
                <p class="service-card-price">${currencyManager.formatPrice(service.precio || 0)}</p>
            </div>
        `;
        
        // Añadimos el listener a cada tarjeta
        card.addEventListener('click', () => {
            // Quitamos la selección de otras tarjetas
            document.querySelectorAll('.service-card.selected').forEach(c => c.classList.remove('selected'));
            // Marcamos la tarjeta actual como seleccionada
            card.classList.add('selected');
            
            // Guardamos los datos del servicio seleccionado
            hiddenInput.value = service.id;
            selectedService = JSON.parse(card.dataset.serviceData);
            
            // Disparamos la carga de disponibilidad (igual que antes)
            if (dateInput.value) {
                fetchAvailability(dateInput.value);
            }
        });

        carousel.appendChild(card);
    });
};
    
    // El resto de tus funciones (fetchAvailability, populateTimeSelect, navigateToStep, etc.)
    // permanecen exactamente iguales, ya que su lógica no se ve afectada.
    // Solo necesitamos agregar el listener para el nuevo botón.

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
    
    const navigateToStep = (stepNumber) => {
        if (stepNumber > currentStep) {
            if (currentStep === 1 && !document.getElementById('selected-service-id').value) { alert("Por favor, selecciona un servicio del carrusel."); return; }            if (currentStep === 2 && (!dateInput.value || !timeSelect.value)) { alert("Por favor, selecciona fecha y hora."); return; }
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

        const basePriceUSD = selectedService.precio || 0;
        const serviceName = selectedService.nombre_personalizado || selectedService.nombre || 'Servicio';
        const date = new Date(dateInput.value + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const time = timeSelect.options[timeSelect.selectedIndex].textContent;
        const clientName = clientSearchInput.value;
        const serviceLocation = selectedServiceType === 'domicilio' ? 'A Domicilio' : 'En el Estudio';

        const priceUSDText = `USD ${basePriceUSD.toFixed(2)}`;
        let priceVESText = 'Calculando...';
        if (currencyManager.finalRate > 0) {
            const vesAmount = basePriceUSD * currencyManager.finalRate;
            priceVESText = `VES ${vesAmount.toFixed(2)}`;
        }

        bookingSummary.innerHTML = `
            <p><strong>Barbero:</strong> ${barberData.nombre}</p>
            <p><strong>Modalidad:</strong> ${serviceLocation}</p>
            <p><strong>Servicio:</strong> ${serviceName}</p>
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Hora:</strong> ${time}</p>
            <p><strong>Cliente:</strong> ${clientName.trim()}</p>
            
            <div class="payment-currency-selection">
                <h4>Selecciona tu Moneda de Pago</h4>
                <div class="radio-group-summary">
                    <input type="radio" id="currency-usd" name="payment_currency" value="USD" checked>
                    <label for="currency-usd">
                        <i class="fas fa-dollar-sign"></i> Pagar en Dólares
                        <span class="price-display">${priceUSDText}</span>
                    </label>
                </div>
                <div class="radio-group-summary">
                    <input type="radio" id="currency-ves" name="payment_currency" value="VES" ${currencyManager.finalRate <= 0 ? 'disabled' : ''}>
                    <label for="currency-ves">
                        <i class="fas fa-money-bill-wave"></i> Pagar en Bolívares
                        <span class="price-display">${priceVESText}</span>
                    </label>
                </div>
            </div>
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
                alert("El horario seleccionado ya no está disponible. Por favor, recarga o elige otro.");
                if (submitButton) submitButton.disabled = false;
                return;
            }
            
            const endTime = selectedSlot.hora_fin || selectedSlot.end_time || selectedSlot.hora_fin_cita;

            if (!endTime) {
                alert("Error interno: el horario de fin no se pudo determinar. Por favor, selecciona otra hora.");
                if (submitButton) submitButton.disabled = false;
                return;
            }

            const selectedCurrency = document.querySelector('input[name="payment_currency"]:checked').value;
            const basePriceUSD = selectedService.precio || 0;
            let finalAmount = 0;

            if (selectedCurrency === 'USD') {
                finalAmount = basePriceUSD;
            } else { // VES
                finalAmount = basePriceUSD * currencyManager.finalRate;
            }

            const bookingPayload = {
                barberId: barberId,
                clientName: clientSearchInput.value.trim(),
                clientPhone: clientPhoneInput.value.trim(),
                serviceId: selectedService.id,
                bookingDate: dateInput.value,
                startTime: startTime,
                endTime: endTime,
                monto: finalAmount,
                moneda: selectedCurrency,
                precio_final: basePriceUSD,
                serviceType: selectedServiceType,
                estimatedDuration: selectedService.duracion_minutos
            };

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

    // --- LISTENERS DE EVENTOS ---
    form.addEventListener('submit', handleBookingSubmit);
    
    // --- NUEVO: Listener para el botón de la portada ---
    showBookingModalBtn.addEventListener('click', initServiceTypeModal);

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
        // En lugar de llamar al modal, ahora solo cargamos los datos para la portada
        fetchBarberData();
    }
});
