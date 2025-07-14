function setupRealtimeListener() {
    if (!currentUserId) return;
    
    if (notificationChannel) {
        supabaseClient.removeChannel(notificationChannel);
        notificationChannel = null;
    }

    const channelName = `realtime:notifications:${currentUserId}`;
    notificationChannel = supabaseClient
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notificaciones',
                filter: `barbero_id=eq.${currentUserId}`
            },
            (payload) => {
                console.log('✅ [Realtime] ¡Nueva notificación recibida!', payload); // Log para ver el payload
                handleNewNotification(payload.new);
            }
        )
        .subscribe((status, error) => {
            // --- INICIO DE LA MEJORA DE DEPURACIÓN ---
            isRealtimeActive = status === 'SUBSCRIBED';
            if (status === 'SUBSCRIBED') {
                console.log(`✅ [Realtime] Suscripción al canal '${channelName}' exitosa.`);
            } else {
                console.warn(`[Realtime] Estado del canal '${channelName}': ${status}`);
            }
            if (error) {
                console.error(`❌ [Realtime] Error en la suscripción al canal:`, error);
            }
            // --- FIN DE LA MEJORA DE DEPURACIÓN ---
        });
}
