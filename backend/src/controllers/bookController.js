const bookService = require('../services/bookService');

async function listBooks(req, res, next) {
  try {
    const result = await bookService.listBooks(req.query);
    res.status(200).json({ status: 'ok', data: result });
  } catch (error) {
    next(error);
  }
}

async function getBookById(req, res, next) {
  try {
    const book = await bookService.getBookById(req.params.id);
    res.status(200).json({ status: 'ok', data: book });
  } catch (error) {
    next(error);
  }
}

async function getBookForEditor(req, res, next) {
  try {
    const book = await bookService.getBookForEditor(req.params.id);
    res.status(200).json({ status: 'ok', data: book });
  } catch (error) {
    next(error);
  }
}

async function getCatalogMetadata(req, res, next) {
  try {
    const meta = await bookService.getCatalogMetadata();
    res.status(200).json({ status: 'ok', data: meta });
  } catch (error) {
    next(error);
  }
}

async function createBook(req, res, next) {
  try {
    const book = await bookService.createBook(req.body, req.user.id, req.ip);
    res.status(201).json({ status: 'ok', message: 'Libro registrado correctamente', data: book });
  } catch (error) {
    next(error);
  }
}

async function updateBook(req, res, next) {
  try {
    const book = await bookService.updateBook(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Libro actualizado correctamente', data: book });
  } catch (error) {
    next(error);
  }
}

async function deleteBook(req, res, next) {
  try {
    await bookService.deleteBook(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Libro descontinuado correctamente' });
  } catch (error) {
    next(error);
  }
}

async function addOrUpdateReview(req, res, next) {
  try {
    const book = await bookService.addOrUpdateReview(req.params.id, req.user.id, req.body);
    res.status(201).json({ status: 'ok', message: 'Resena guardada correctamente', data: book });
  } catch (error) {
    next(error);
  }
}

async function getMyFavorites(req, res, next) {
  try {
    const items = await bookService.getMyFavorites(req.user.id);
    res.status(200).json({ status: 'ok', data: items });
  } catch (error) {
    next(error);
  }
}

async function toggleFavorite(req, res, next) {
  try {
    const result = await bookService.toggleFavorite(req.params.id, req.user.id);
    res.status(200).json({
      status: 'ok',
      message: result.isFavorite ? 'Libro guardado en favoritos' : 'Libro eliminado de favoritos',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await bookService.createCategory(req.body);
    res.status(201).json({ status: 'ok', message: 'Categoria creada correctamente', data: category });
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await bookService.updateCategory(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Categoria actualizada correctamente', data: category });
  } catch (error) {
    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    await bookService.deleteCategory(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Categoria eliminada correctamente' });
  } catch (error) {
    next(error);
  }
}

async function createAuthor(req, res, next) {
  try {
    const author = await bookService.createAuthor(req.body);
    res.status(201).json({ status: 'ok', message: 'Autor creado correctamente', data: author });
  } catch (error) {
    next(error);
  }
}

async function updateAuthor(req, res, next) {
  try {
    const author = await bookService.updateAuthor(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Autor actualizado correctamente', data: author });
  } catch (error) {
    next(error);
  }
}

async function deleteAuthor(req, res, next) {
  try {
    await bookService.deleteAuthor(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Autor eliminado correctamente' });
  } catch (error) {
    next(error);
  }
}

async function createPublisher(req, res, next) {
  try {
    const publisher = await bookService.createPublisher(req.body);
    res.status(201).json({ status: 'ok', message: 'Editorial creada correctamente', data: publisher });
  } catch (error) {
    next(error);
  }
}

async function updatePublisher(req, res, next) {
  try {
    const publisher = await bookService.updatePublisher(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Editorial actualizada correctamente', data: publisher });
  } catch (error) {
    next(error);
  }
}

async function deletePublisher(req, res, next) {
  try {
    await bookService.deletePublisher(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Editorial eliminada correctamente' });
  } catch (error) {
    next(error);
  }
}

async function createFormat(req, res, next) {
  try {
    const format = await bookService.createFormat(req.body);
    res.status(201).json({ status: 'ok', message: 'Formato creado correctamente', data: format });
  } catch (error) {
    next(error);
  }
}

async function updateFormat(req, res, next) {
  try {
    const format = await bookService.updateFormat(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Formato actualizado correctamente', data: format });
  } catch (error) {
    next(error);
  }
}

async function deleteFormat(req, res, next) {
  try {
    await bookService.deleteFormat(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Formato eliminado correctamente' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBooks,
  getBookById,
  getBookForEditor,
  getCatalogMetadata,
  createBook,
  updateBook,
  deleteBook,
  addOrUpdateReview,
  getMyFavorites,
  toggleFavorite,
  createCategory,
  updateCategory,
  deleteCategory,
  createAuthor,
  updateAuthor,
  deleteAuthor,
  createPublisher,
  updatePublisher,
  deletePublisher,
  createFormat,
  updateFormat,
  deleteFormat
};
