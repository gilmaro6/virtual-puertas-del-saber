const test = require('node:test');
const assert = require('node:assert/strict');

const { requirePermission } = require('../src/middlewares/authMiddleware');
const { validatePaymentDetails } = require('../src/services/orderService');
const { generateCaptcha } = require('../src/services/authService');

test('requirePermission permite acceso cuando el usuario tiene el permiso', () => {
  const middleware = requirePermission('DASHBOARD_VER');
  const req = { user: { permisos: ['DASHBOARD_VER', 'CATALOGO_CREAR'] } };
  let calledWith;
  middleware(req, {}, (err) => {
    calledWith = err;
  });
  assert.equal(calledWith, undefined);
});

test('requirePermission rechaza con 403 cuando falta el permiso', () => {
  const middleware = requirePermission('ROLES_PERMISOS_GESTIONAR');
  const req = { user: { permisos: ['COMPRAR_LIBROS'] } };
  let capturedErr;
  middleware(req, {}, (err) => {
    capturedErr = err;
  });
  assert.ok(capturedErr);
  assert.equal(capturedErr.statusCode, 403);
});

test('validatePaymentDetails enmascara tarjeta y omite CVV', () => {
  const result = validatePaymentDetails('TARJETA', {
    numero_tarjeta: '4111 1111 1111 4242',
    titular: 'Gilson Martinez',
    expiracion: '12/29',
    cvv: '123',
    cuotas: 3
  });
  assert.equal(result.franquicia, 'VISA');
  assert.equal(result.ultimos_4, '4242');
  assert.equal(result.cuotas, 3);
  assert.equal(result.cvv, undefined);
});

test('validatePaymentDetails rechaza tarjeta con formato invalido', () => {
  assert.throws(
    () => validatePaymentDetails('TARJETA', { numero_tarjeta: '123', titular: 'Test', expiracion: '12/29', cvv: '123' }),
    (err) => err.statusCode === 400
  );
});

test('validatePaymentDetails valida campos obligatorios de PSE', () => {
  const pse = validatePaymentDetails('PSE', {
    banco: 'Bancolombia',
    tipo_persona: 'NATURAL',
    tipo_documento: 'CC',
    numero_documento: '1020304050',
    email_pse: 'cliente@correo.com'
  });
  assert.equal(pse.banco, 'Bancolombia');
  assert.ok(pse.cus_simulado.startsWith('CUS-'));
});

test('generateCaptcha genera pregunta y token JWT', () => {
  const captcha = generateCaptcha();
  assert.ok(captcha.question.includes('?'));
  assert.ok(captcha.captchaToken.split('.').length === 3);
});
