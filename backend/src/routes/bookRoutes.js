const express = require('express');
const bookController = require('../controllers/bookController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();

// Rutas publicas del catalogo
router.get('/', bookController.listBooks);
router.get('/meta', bookController.getCatalogMetadata);
router.get('/:id', bookController.getBookById);

// Contenido editable para administrador/bibliotecario
router.get('/:id/editor', verifyToken, requirePermission('CATALOGO_EDITAR'), bookController.getBookForEditor);

// Resenas (usuarios autenticados con permiso)
router.post('/:id/reviews', verifyToken, requirePermission('ESCRIBIR_RESENAS'), bookController.addOrUpdateReview);

// Parametrizacion del catalogo
router.post('/categories', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.createCategory);
router.put('/categories/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.updateCategory);
router.delete('/categories/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.deleteCategory);

router.post('/authors', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.createAuthor);
router.put('/authors/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.updateAuthor);
router.delete('/authors/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.deleteAuthor);

router.post('/publishers', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.createPublisher);
router.put('/publishers/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.updatePublisher);
router.delete('/publishers/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.deletePublisher);

router.post('/formats', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.createFormat);
router.put('/formats/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.updateFormat);
router.delete('/formats/:id', verifyToken, requirePermission('PARAMETRIZACION_GESTIONAR'), bookController.deleteFormat);

// Administracion de libros
router.post('/', verifyToken, requirePermission('CATALOGO_CREAR'), bookController.createBook);
router.put('/:id', verifyToken, requirePermission('CATALOGO_EDITAR'), bookController.updateBook);
router.delete('/:id', verifyToken, requirePermission('CATALOGO_ELIMINAR'), bookController.deleteBook);

module.exports = router;
