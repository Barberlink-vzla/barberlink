async function handleBookingSubmit(e) {
    e.preventDefault();
    const statusMessage = document.getElementById('booking-status');
    statusMessage.textContent = 'Procesando reserva...';
    statusMessage.className = 'status-message';

    try {
        const serviceSelect = document.getElementById('service-select');
        const dateInput = document.getElementById('booking-date');
        const timeSelect = document.getElementById('time-select');
        const clientSearchInput = document.getElementById('cliente-search');

        // Se asume que las variables de estado como barberId y selectedService
        // están disponibles en un scope superior.

        const serviceData = JSON.parse(serviceSelect.options[serviceSelect.selectedIndex].dataset.serviceData);
        const startTime = timeSelect.value;
        const bookingDate = new Date(`${dateInput.value}T${startTime}`);
        
        // Mejora: Se usa la variable 'selectedService' que se actualiza al elegir un servicio.
        const durationInMinutes = selectedService.duracion_minutos || 30;
        const endTime = new Date(bookingDate.getTime() + durationInMinutes * 60 * 1000).toTimeString().slice(0, 8);

        // Corrección Clave: Capturar el ID retornado por la función en una constante.
        const clienteId = await getClientIdForBooking();

        const bookingData = {
            barbero_id: barberId,
            cliente_id: clienteId, // ¡Solucionado! Ahora la variable sí existe.
            cliente_nombre: clientSearchInput.value.trim(),
            cliente_telefono: document.getElementById('cliente_telefono').value.trim(),
            servicio_reservado_id: serviceData.id,
            fecha_cita: dateInput.value,
            hora_inicio_cita: startTime,
            hora_fin_cita: endTime,
            precio_final: serviceData.precio,
            estado: 'pendiente'
        };

        const { data: bookingResult, error: bookingError } = await supabaseClient
            .from('citas')
            .insert(bookingData)
            .select()
            .single();

        if (bookingError) {
            // Manejo de error específico para citas duplicadas.
            if (bookingError.code === '23505') { 
                throw new Error("Lo sentimos, este horario acaba de ser reservado. Por favor, selecciona otro.");
            }
            throw new Error(`No se pudo crear la cita: ${bookingError.message}`);
        }

        if (!bookingResult) {
            throw new Error("La reserva no pudo ser confirmada. Inténtalo de nuevo.");
        }

        // Crear la notificación para el barbero.
        const date = new Date(bookingResult.fecha_cita + 'T12:00:00');
        const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const time = new Date(`1970-01-01T${bookingResult.hora_inicio_cita}`);
        const formattedTime = time.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });
        const notificationMessage = `¡Nueva reserva de ${bookingResult.cliente_nombre}! Agendado para el ${formattedDate} a las ${formattedTime}.`;

        const { data: persistentNotification, error: notifError } = await supabaseClient
            .from('notificaciones')
            .insert({
                barbero_id: barberId,
                cita_id: bookingResult.id,
                mensaje: notificationMessage,
                tipo: 'nueva_reserva',
                leido: false
            })
            .select()
            .single();

        if (notifError) {
            // No se detiene el flujo, pero se registra el error.
            console.error("Error al crear la notificación persistente:", notifError);
        }
        
        // Enviar notificación en tiempo real (broadcast) al barbero.
        if (persistentNotification) {
            const channelName = `notifications-channel-for-${barberId}`;
            const channel = supabaseClient.channel(channelName);

            const broadcastPayload = {
                event: 'nueva_reserva',
                payload: persistentNotification // Se envía el objeto completo de la notificación.
            };

            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    channel.send({
                        type: 'broadcast',
                        event: 'new-notification',
                        payload: broadcastPayload,
                    });
                    console.log(`🚀 Mensaje de Broadcast enviado al canal: ${channelName}`);
                }
            });
        }
        
        // Actualizar la interfaz para mostrar el éxito de la reserva.
        document.getElementById('barberBookingForm').style.display = 'none';
        document.getElementById('booking-success-message').style.display = 'block';
        statusMessage.textContent = '';
        generateWhatsAppLink(bookingResult);

    } catch (error) {
        console.error("Error en el proceso de reserva:", error);
        statusMessage.textContent = `Error: ${error.message}`;
        statusMessage.className = 'status-message error';
        alert(error.message + "\n\nVamos a recargar los horarios disponibles.");
        fetchAvailability(document.getElementById('booking-date').value);
    }
}
