const express = require('express');
const orderController = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

// Rutas del cliente autenticado
router.post('/', orderController.createOrder);
router.get('/my', orderController.getMyOrders);
router.get('/rentals/my', orderController.getMyRentals);

// Rutas de administracion e historial (solo ADMIN)
router.get('/history/inventory', requireRole('ADMIN'), orderController.getInventoryHistory);
router.get('/history/audit', requireRole('ADMIN'), orderController.getAuditHistory);
router.get('/', requireRole('ADMIN'), orderController.listAllOrders);
router.patch('/:id/status', requireRole('ADMIN'), orderController.updateOrderStatus);
router.patch('/rentals/:rentalId/return', requireRole('ADMIN'), orderController.returnRental);

// Detalle de un pedido (dueno o ADMIN)
router.get('/:id', orderController.getOrderById);

module.exports = router;
