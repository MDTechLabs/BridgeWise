export const translations = {
  en: {
    common: {
      bridge: 'Bridge',
      swap: 'Swap',
      selectToken: 'Select Token',
      connectWallet: 'Connect Wallet',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
    },
    bridge: {
      title: 'Bridge Assets',
      source: 'Source Chain',
      destination: 'Destination Chain',
      amount: 'Amount',
      transfer: 'Transfer',
    },
  },
  es: {
    common: {
      bridge: 'Puente',
      swap: 'Intercambio',
      selectToken: 'Seleccionar Token',
      connectWallet: 'Conectar Billetera',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
    },
    bridge: {
      title: 'Puente de Activos',
      source: 'Cadena de Origen',
      destination: 'Cadena de Destino',
      amount: 'Cantidad',
      transfer: 'Transferir',
    },
  },
  fr: {
    common: {
      bridge: 'Pont',
      swap: 'Échange',
      selectToken: 'Sélectionner un Token',
      connectWallet: 'Connecter le Portefeuille',
      loading: 'Chargement...',
      error: 'Erreur',
      success: 'Succès',
    },
    bridge: {
      title: 'Pont d\'Actifs',
      source: 'Chaîne d\'Origine',
      destination: 'Chaîne de Destination',
      amount: 'Montant',
      transfer: 'Transférer',
    },
  },
};

export type Language = keyof typeof translations;
export type TranslationKeys = typeof translations.en;
