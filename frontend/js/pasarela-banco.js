const BANK_PORTALS = {
  Bancolombia: {
    primary: '#2C2A29',
    accent: '#FDDA24',
    text: '#ffffff',
    initials: 'BC',
    title: 'Bancolombia · Sucursal Virtual Personas',
    subtitle: 'Redireccion al portal oficial de Bancolombia via PSE',
    url: 'https://sucursalpersonas.transaccionesbancolombia.com/bancolombia/jump.jsp?cerrarSesion=true'
  },
  Davivienda: {
    primary: '#D91920',
    accent: '#FFFFFF',
    text: '#ffffff',
    initials: 'DV',
    title: 'Davivienda · Portal de Personas',
    subtitle: 'Redireccion al portal oficial de Davivienda via PSE',
    url: 'https://personas.davivienda.com/'
  },
  'Banco de Bogota': {
    primary: '#004386',
    accent: '#F2A900',
    text: '#ffffff',
    initials: 'BB',
    title: 'Banco de Bogota · Banca Virtual',
    subtitle: 'Redireccion al portal oficial del Banco de Bogota via PSE',
    url: 'https://virtual.bancodebogota.co/'
  },
  'BBVA Colombia': {
    primary: '#004481',
    accent: '#2DCCCD',
    text: '#ffffff',
    initials: 'BBVA',
    title: 'BBVA Colombia · BBVA Net',
    subtitle: 'Redireccion al portal oficial de BBVA Colombia via PSE',
    url: 'https://personas.bbvanet.com.co/'
  },
  'Banco de Occidente': {
    primary: '#00529B',
    accent: '#E31837',
    text: '#ffffff',
    initials: 'BO',
    title: 'Banco de Occidente · Banca Virtual',
    subtitle: 'Redireccion al portal oficial del Banco de Occidente via PSE',
    url: 'https://www.bancodeoccidente.com.co/'
  },
  Nequi: {
    primary: '#200020',
    accent: '#DA0081',
    text: '#ffffff',
    initials: 'NQ',
    title: 'Nequi · Plataforma Oficial',
    subtitle: 'Redireccion a Nequi Colombia via PSE',
    url: 'https://www.nequi.com.co/'
  },
  Daviplata: {
    primary: '#C8102E',
    accent: '#FFD100',
    text: '#ffffff',
    initials: 'DP',
    title: 'Daviplata · Plataforma Oficial',
    subtitle: 'Redireccion a Daviplata Colombia via PSE',
    url: 'https://www.daviplata.com/'
  }
};

let pendingPse = null;

function showBankAlert(message, type = 'danger') {
  document.getElementById('bankAlert').innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show py-2 small" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function applyBankPortal(bankName) {
  const portal = BANK_PORTALS[bankName] || {
    primary: '#142D4E',
    accent: '#F4B942',
    text: '#ffffff',
    initials: 'PSE',
    title: `${bankName || 'Entidad Bancaria'} · PSE`,
    subtitle: 'Redireccion al portal oficial PSE (ACH Colombia)',
    url: 'https://www.pse.com.co/persona'
  };

  document.documentElement.style.setProperty('--bank-primary', portal.primary);
  document.documentElement.style.setProperty('--bank-accent', portal.accent);
  document.documentElement.style.setProperty('--bank-text-on-primary', portal.text);

  document.getElementById('bankInitials').textContent = portal.initials;
  document.getElementById('bankPortalTitle').textContent = portal.title;
  document.getElementById('bankPortalSubtitle').textContent = portal.subtitle;
  document.getElementById('bankNameHeading').textContent = bankName || 'tu Banco';
  document.getElementById('openBankBtnName').textContent = bankName || 'Banco';

  const linkEl = document.getElementById('officialBankUrlLink');
  linkEl.href = portal.url;
  linkEl.textContent = portal.url;
  document.getElementById('openOfficialBankBtn').href = portal.url;
  document.title = `PSE · ${bankName || 'Banco'} | Danzara`;
}

function initPsePortal() {
  const raw = sessionStorage.getItem('pds_pending_pse');
  if (!raw || !getToken()) {
    window.location.href = 'index.html';
    return;
  }

  try {
    pendingPse = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem('pds_pending_pse');
    window.location.href = 'index.html';
    return;
  }

  const dp = pendingPse.datos_pago || {};
  applyBankPortal(dp.banco);

  document.getElementById('pseCusCode').textContent = pendingPse.cus_preview || `CUS-${Math.floor(10000000 + Math.random() * 90000000)}`;
  document.getElementById('pseBankName').textContent = dp.banco || '-';
  document.getElementById('psePayerDoc').textContent = `${dp.tipo_documento || 'CC'} ${dp.numero_documento || ''} (${dp.tipo_persona || 'NATURAL'})`;
  document.getElementById('psePayerEmail').textContent = dp.email_pse || '-';
  document.getElementById('pseConcept').textContent = `${pendingPse.items_count || 1} libro(s) en Libreria Danzara`;
  document.getElementById('pseAmount').textContent = formatCurrency(pendingPse.net_total);
  document.getElementById('approvePseAmount').textContent = formatCurrency(pendingPse.net_total);
}

document.getElementById('approvePseBtn').addEventListener('click', async () => {
  const mask = document.getElementById('bankProcessingMask');
  const maskTitle = document.getElementById('maskTitle');
  const maskSub = document.getElementById('maskSubtitle');
  mask.classList.add('show');
  maskTitle.textContent = 'Confirmando pago PSE...';
  maskSub.textContent = `Registrando comprobante de ${pendingPse.datos_pago.banco} y generando factura FV-XXXX...`;

  try {
    await new Promise((r) => setTimeout(r, 800));
    const res = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        metodo_pago: 'PSE',
        datos_pago: pendingPse.datos_pago,
        codigo_cupon: pendingPse.codigo_cupon || null,
        direccion_envio: pendingPse.direccion_envio || null,
        ciudad: pendingPse.ciudad || null
      })
    });

    sessionStorage.removeItem('pds_pending_pse');
    sessionStorage.setItem('pds_payment_result', JSON.stringify({
      status: 'APPROVED',
      bank: pendingPse.datos_pago.banco,
      order: res.data
    }));

    window.location.href = 'index.html?payment=approved';
  } catch (error) {
    mask.classList.remove('show');
    showBankAlert(error.message);
  }
});

document.getElementById('rejectPseBtn').addEventListener('click', () => {
  sessionStorage.removeItem('pds_pending_pse');
  sessionStorage.setItem('pds_payment_result', JSON.stringify({
    status: 'REJECTED',
    bank: pendingPse?.datos_pago?.banco || 'Entidad Bancaria',
    reason: 'La transaccion fue reportada como rechazada por la entidad financiera. No se realizo ningun cargo.'
  }));
  window.location.href = 'index.html?payment=rejected';
});

document.getElementById('cancelPseBtn').addEventListener('click', () => {
  sessionStorage.removeItem('pds_pending_pse');
  sessionStorage.setItem('pds_payment_result', JSON.stringify({
    status: 'CANCELLED',
    bank: pendingPse?.datos_pago?.banco || 'Entidad Bancaria',
    reason: 'Cancelaste el pago PSE. Tu carrito permanece intacto.'
  }));
  window.location.href = 'index.html?payment=cancelled';
});

initPsePortal();
