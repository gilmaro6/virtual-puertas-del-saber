const test = require('node:test');
const assert = require('node:assert/strict');

const { requirePermission } = require('../src/middlewares/authMiddleware');
const { validatePaymentDetails } = require('../src/services/orderService');
const { generateCaptcha } = require('../src/services/authService');
const { calculateCouponDiscount } = require('../src/services/couponService');
const {
  validateRegister,
  validateResetPassword,
  validateBookPayload,
  validateOrderPayload,
  validateCouponPayload
} = require('../src/middlewares/validators');
const { openApiSpec } = require('../src/config/openapi');

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

test('calculateCouponDiscount aplica descuento porcentual correctamente', () => {
  const coupon = {
    codigo: 'DANZARA10',
    tipo: 'PORCENTAJE',
    valor: 10,
    monto_minimo: 30000,
    usos_maximos: 100,
    usos_actuales: 1,
    fecha_expiracion: null,
    activo: 1
  };
  const res = calculateCouponDiscount(coupon, 50000);
  assert.equal(res.descuento, 5000);
  assert.equal(res.total_con_descuento, 45000);
});

test('calculateCouponDiscount rechaza cupon cuando no alcanza monto minimo o esta vencido', () => {
  const minCoupon = {
    codigo: 'MIN50',
    tipo: 'MONTO_FIJO',
    valor: 10000,
    monto_minimo: 60000,
    usos_maximos: null,
    usos_actuales: 0,
    fecha_expiracion: null,
    activo: 1
  };
  assert.throws(() => calculateCouponDiscount(minCoupon, 40000), (err) => err.statusCode === 400);

  const expiredCoupon = {
    ...minCoupon,
    monto_minimo: 0,
    fecha_expiracion: '2020-01-01T00:00:00.000Z'
  };
  assert.throws(() => calculateCouponDiscount(expiredCoupon, 40000), (err) => err.statusCode === 400);
});

test('validateRegister rechaza correo invalido o contrasena corta', () => {
  let err;
  validateRegister({ body: { nombre: 'Ana', apellido: 'Ruiz', email: 'correo-malo', password: '123' } }, {}, (e) => {
    err = e;
  });
  assert.ok(err);
  assert.equal(err.statusCode, 400);
});

test('validateResetPassword exige codigo numerico de 6 digitos', () => {
  let err;
  validateResetPassword({ body: { email: 'ana@correo.com', codigo: 'abc', nuevaContrasena: 'password123' } }, {}, (e) => {
    err = e;
  });
  assert.ok(err);
  assert.equal(err.statusCode, 400);
});

test('validateBookPayload rechaza precios negativos en creacion de libro', () => {
  let err;
  validateBookPayload({ method: 'POST', body: { titulo: 'Libro Prueba', precio_venta: -5000 } }, {}, (e) => {
    err = e;
  });
  assert.ok(err);
  assert.equal(err.statusCode, 400);
});

test('validateOrderPayload rechaza metodos de pago no soportados', () => {
  let err;
  validateOrderPayload({ body: { metodo_pago: 'BITCOIN' } }, {}, (e) => {
    err = e;
  });
  assert.ok(err);
  assert.equal(err.statusCode, 400);
});

test('validateCouponPayload rechaza porcentaje mayor a 100', () => {
  let err;
  validateCouponPayload({ body: { codigo: 'MEGA200', tipo: 'PORCENTAJE', valor: 150 } }, {}, (e) => {
    err = e;
  });
  assert.ok(err);
  assert.equal(err.statusCode, 400);
});

test('openApiSpec define version 3.0.3 y documenta endpoints principales', () => {
  assert.equal(openApiSpec.openapi, '3.0.3');
  assert.ok(openApiSpec.paths['/books']);
  assert.ok(openApiSpec.paths['/orders']);
  assert.ok(openApiSpec.paths['/coupons/validate']);
  assert.ok(openApiSpec.paths['/orders/reader/{bookId}/progress']);
});
