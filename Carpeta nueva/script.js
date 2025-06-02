document.addEventListener('DOMContentLoaded', function () {
    const steps = Array.from(document.querySelectorAll('.form-step'));
    const nextButtons = document.querySelectorAll('.next-btn');
    const prevButtons = document.querySelectorAll('.prev-btn');
    const submitWhatsappButton = document.getElementById('submitWhatsapp');
    const form = document.getElementById('barberBookingForm');
    const progressBarSteps = document.querySelectorAll('.progress-bar-step');
    const progressBarLines = document.querySelectorAll('.progress-bar-line');

    let currentStep = 0;

    // CAMBIA ESTE NÚMERO POR EL DE LA BARBERÍA (CÓDIGO DE PAÍS + NÚMERO, SIN '+')
    const barberPhoneNumber = 'TU_NUMERO_DE_WHATSAPP_AQUI'; // Ejemplo: 584121234567

    function updateProgressBar() {
        progressBarSteps.forEach((stepCircle, index) => {
            if (index < currentStep) {
                stepCircle.classList.add('completed');
                stepCircle.classList.remove('active');
            } else if (index === currentStep) {
                stepCircle.classList.add('active');
                stepCircle.classList.remove('completed');
            } else {
                stepCircle.classList.remove('active', 'completed');
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

    function showStep(stepIndex, direction = 'next') {
        steps.forEach((step, index) => {
            step.classList.remove('active-step', 'inactive-step-left');
            if (index === stepIndex) {
                step.classList.add('active-step');
            } else if (index < stepIndex && direction === 'prev') {
                // No se aplica animación específica al ocultar hacia atrás por simplicidad
                // la animación de entrada del nuevo paso domina
            } else if (index > stepIndex && direction === 'next') {
                // No se aplica animación específica al ocultar hacia adelante
            }
        });
        updateProgressBar();
    }

    function validateStep(stepIndex) {
        let isValid = true;
        const currentStepInputs = steps[stepIndex].querySelectorAll('input[required], select[required]');
        currentStepInputs.forEach(input => {
            input.classList.remove('invalid'); // Remover clase de error previa
            if (!input.value.trim() || (input.type === 'select-one' && input.value === "")) {
                isValid = false;
                input.classList.add('invalid'); // Marcar campo inválido
            }
        });
        return isValid;
    }

    nextButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                if (currentStep < steps.length - 1) {
                    steps[currentStep].classList.add('inactive-step-left'); // Animación de salida
                    currentStep++;
                    // Pequeño delay para que la animación de salida se aprecie antes de la de entrada
                    setTimeout(() => {
                        showStep(currentStep, 'next');
                    }, 150); // Ajusta este tiempo si es necesario
                }
            } else {
                // Opcional: alert o mensaje más sofisticado
                // alert('Por favor, completa todos los campos obligatorios.');
            }
        });
    });

    prevButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (currentStep > 0) {
                // No se aplica 'inactive-step-left' aquí ya que el siguiente (previo) vendrá de la izquierda
                steps[currentStep].classList.remove('active-step'); // Oculta el actual inmediatamente
                currentStep--;
                showStep(currentStep, 'prev');
            }
        });
    });

    submitWhatsappButton.addEventListener('click', () => {
        if (!validateStep(currentStep)) {
            // alert('Por favor, completa todos los campos obligatorios del servicio.');
            return;
        }

        const nombre = document.getElementById('nombre').value;
        const telefono = document.getElementById('telefono').value;
        const emailInput = document.getElementById('email');
        const email = emailInput ? emailInput.value : ''; // Manejar si el campo email no existe
        const fecha = document.getElementById('fecha').value;
        const hora = document.getElementById('hora').value;
        const servicio = document.getElementById('servicio').value;

        let fechaFormateada = 'No especificada';
        if (fecha) {
            try {
                // Intentar formatear la fecha de manera más robusta
                const dateObj = new Date(fecha + 'T00:00:00'); // Añadir T00:00:00 para evitar problemas de zona horaria al interpretar solo la fecha
                fechaFormateada = dateObj.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } catch (e) {
                console.error("Error formateando fecha:", e);
                fechaFormateada = fecha; // Usar la fecha raw si hay error
            }
        }

        const horaFormateada = hora || 'No especificada';

        if (barberPhoneNumber === 'TU_NUMERO_DE_WHATSAPP_AQUI' || barberPhoneNumber === '') {
            alert('Error: Número de WhatsApp de la barbería no configurado.');
            return;
        }

        let message = `¡Hola! Quiero agendar una cita:\n\n`;
        message += `*👤 Cliente:* ${nombre}\n`;
        message += `*📱 Teléfono:* ${telefono}\n`;
        if (email) {
            message += `*✉️ Email:* ${email}\n`;
        }
        message += `*🗓️ Fecha:* ${fechaFormateada}\n`;
        message += `*🕒 Hora:* ${horaFormateada}\n`;
        message += `*💈 Servicio:* ${servicio}\n\n`;
        message += `Espero confirmación. ¡Gracias!`;

        const whatsappUrl = `https://wa.me/${barberPhoneNumber}?text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank');
    });

    // Mostrar el primer paso e inicializar la barra de progreso al cargar
    showStep(currentStep);
});
