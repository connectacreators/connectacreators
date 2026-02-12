export const t = {
  // Dashboard
  dashboard: {
    greeting: { en: "Hi", es: "Hola" },
    question: { en: "What do you want to do today?", es: "¿Qué quieres hacer hoy?" },
    signOut: { en: "Sign out", es: "Cerrar sesión" },
    home: { en: "Home", es: "Inicio" },
    scripts: { en: "Scripts", es: "Scripts" },
    leadTracker: { en: "Lead Tracker", es: "Lead Tracker" },
    leadCalendar: { en: "Lead Calendar", es: "Lead Calendar" },
    settings: { en: "Settings", es: "Configuración" },
    scriptDesc: { en: "Categorize and manage your video scripts.", es: "Categoriza y gestiona tus guiones de video." },
    leadTrackerDesc: { en: "View and manage your CRM leads.", es: "Visualiza y gestiona tus leads del CRM." },
    leadCalendarDesc: { en: "View scheduled appointments from your leads.", es: "Visualiza citas programadas de tus leads." },
  },
  // Lead Tracker
  leadTracker: {
    title: { en: "Lead Tracker", es: "Lead Tracker" },
    totalLeads: { en: "Total Leads", es: "Total Leads" },
    booked: { en: "Booked", es: "Reservados" },
    conversion: { en: "Conversion", es: "Conversión" },
    allClients: { en: "All clients", es: "Todos los clientes" },
    searchPlaceholder: { en: "Search by name, email or phone...", es: "Buscar por nombre, email o teléfono..." },
    allStatuses: { en: "All statuses", es: "Todos los status" },
    allSources: { en: "All sources", es: "Todas las fuentes" },
    noLeads: { en: "No leads to show.", es: "No hay leads para mostrar." },
    noResults: { en: "No results with these filters.", es: "No hay resultados con estos filtros." },
    noName: { en: "No name", es: "Sin nombre" },
  },
  // Lead Calendar
  leadCalendar: {
    title: { en: "Lead Calendar", es: "Lead Calendar" },
    today: { en: "Today", es: "Hoy" },
    leads: { en: "Leads", es: "Leads" },
    noLeads: { en: "No leads.", es: "No hay leads." },
    week: { en: "Week", es: "Semana" },
    month: { en: "Month", es: "Mes" },
    year: { en: "Year", es: "Año" },
    allClients: { en: "All clients", es: "Todos los clientes" },
    noName: { en: "No name", es: "Sin nombre" },
    client: { en: "Client", es: "Cliente" },
  },
  // Scripts
  scripts: {
    home: { en: "Home", es: "Inicio" },
    exit: { en: "Exit", es: "Salir" },
    newClient: { en: "New Client", es: "Nuevo Cliente" },
    cancel: { en: "Cancel", es: "Cancelar" },
    createClient: { en: "Create Client", es: "Crear Cliente" },
    clientName: { en: "Client name *", es: "Nombre del cliente *" },
    emailOptional: { en: "Email (optional)", es: "Correo electrónico (opcional)" },
    manageAll: { en: "Manage scripts for all your clients.", es: "Gestiona los scripts de todos tus clientes." },
    assignedClients: { en: "Clients assigned to you.", es: "Clientes asignados a ti." },
    manageYour: { en: "Manage your scripts.", es: "Gestiona tus scripts." },
    videographers: { en: "Videographers", es: "Videógrafos" },
  },
  // Settings
  settings: {
    title: { en: "Account Settings", es: "Configuración de Cuenta" },
    name: { en: "Name", es: "Nombre" },
    namePlaceholder: { en: "Your name", es: "Tu nombre" },
    email: { en: "Email", es: "Correo electrónico" },
    accountType: { en: "Account type", es: "Tipo de cuenta" },
    saveChanges: { en: "Save changes", es: "Guardar cambios" },
    changePassword: { en: "Change Password", es: "Cambiar Contraseña" },
    newPassword: { en: "New password", es: "Nueva contraseña" },
    confirmPassword: { en: "Confirm new password", es: "Confirmar nueva contraseña" },
    showPasswords: { en: "Show", es: "Mostrar" },
    hidePasswords: { en: "Hide", es: "Ocultar" },
    passwords: { en: "passwords", es: "contraseñas" },
    admin: { en: "Admin", es: "Admin" },
    videographer: { en: "Videographer", es: "Videographer" },
    client: { en: "Client", es: "Cliente" },
    profileUpdated: { en: "Profile updated", es: "Perfil actualizado" },
    emailConfirmation: { en: "A confirmation email was sent to the new email.", es: "Se envió un correo de confirmación al nuevo email." },
    saveError: { en: "Error saving", es: "Error al guardar" },
    passwordMinLength: { en: "Password must be at least 6 characters", es: "La contraseña debe tener al menos 6 caracteres" },
    passwordMismatch: { en: "Passwords don't match", es: "Las contraseñas no coinciden" },
    passwordUpdated: { en: "Password updated", es: "Contraseña actualizada" },
    passwordError: { en: "Error changing password", es: "Error al cambiar contraseña" },
  },
} as const;

import type { Language } from "@/hooks/useLanguage";

export function tr(obj: { en: string; es: string }, lang: Language): string {
  return obj[lang];
}
