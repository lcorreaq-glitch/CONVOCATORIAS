// Estados de evaluación (sincronizados con el backend).
// IMPORTANTE: si añades un estado nuevo en routes_eval.py, actualízalo aquí también
// para que los contadores del sidebar y la pantalla de Evaluaciones lo consideren.

// Pendientes: el jurado todavía tiene trabajo por hacer (incluye "habilitadas" + "en gestión").
export const PENDIENTE_STATES = [
  "Pendiente",      // habilitada, aún no iniciada
  "Borrador",       // habilitada, sin guardar
  "Iniciada",       // legacy
  "En edición",     // en gestión (el jurado guardó algo)
  "En proceso",     // variante
  "Reabierta",      // re-abierta tras finalizada (requiere ajustes)
  "Abierta",        // colectiva en curso
];

// Terminadas: trabajo completado o bloqueado para el jurado.
export const TERMINADAS_STATES = [
  "Finalizada",
  "Firmada",
  "Bloqueada",
  "Cerrada",
];

export const isPendiente = (estado) => PENDIENTE_STATES.includes(estado);
export const isTerminada = (estado) => TERMINADAS_STATES.includes(estado);
