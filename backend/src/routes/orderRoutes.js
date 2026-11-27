const express = require('express');
const orderController = require('../controllers/orderController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');
const { validateOrderPayload } = require('../middlewares/validators');

const router = express.Router();

router.use(verifyToken);

// Rutas del cliente autenticado
router.post('/', requirePermission('COMPRAR_LIBROS', 'ALQUILAR_LIBROS'), validateOrderPayload, orderController.createOrder);
router.get('/my', orderController.getMyOrders);
router.get('/rentals/my', orderController.getMyRentals);
router.get('/library/my', requirePermission('LEER_LIBROS_DIGITALES'), orderController.getMyLibrary);
router.get('/reader/:bookId', requirePermission('LEER_LIBROS_DIGITALES', 'CATALOGO_EDITAR'), orderController.getBookForReader);
router.put('/reader/:bookId/progress', requirePermission('LEER_LIBROS_DIGITALES', 'CATALOGO_EDITAR'), orderController.saveReadingProgress);
router.post('/reader/:bookId/security-event', orderController.logReaderSecurityEvent);

// Rutas de administracion e historial por permisos
router.get('/history/inventory', requirePermission('INVENTARIO_VER'), orderController.getInventoryHistory);
router.post('/inventory/adjust', requirePermission('CATALOGO_EDITAR', 'INVENTARIO_VER'), orderController.adjustInventory);
router.get('/history/audit', requirePermission('AUDITORIA_VER'), orderController.getAuditHistory);
router.get('/rentals', requirePermission('PEDIDOS_VER_TODOS'), orderController.listAllRentals);
router.get('/', requirePermission('PEDIDOS_VER_TODOS'), orderController.listAllOrders);
router.patch('/:id/status', requirePermission('PEDIDOS_CAMBIAR_ESTADO'), orderController.updateOrderStatus);
router.patch('/rentals/:rentalId/return', requirePermission('PEDIDOS_CAMBIAR_ESTADO'), orderController.returnRental);

// Detalle y factura de un pedido (dueno o usuario con permiso PEDIDOS_VER_TODOS)
router.get('/:id/invoice', orderController.getOrderInvoice);
router.get('/:id', orderController.getOrderById);

module.exports = router;
