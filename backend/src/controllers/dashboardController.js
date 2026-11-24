const dashboardService = require('../services/dashboardService');

async function getSummary(req, res, next) {
  try {
    const summary = await dashboardService.getDashboardSummary();
    res.status(200).json({ status: 'ok', data: summary });
  } catch (error) {
    next(error);
  }
}

async function exportReport(req, res, next) {
  try {
    const csv = await dashboardService.exportCsvReport(req.params.type);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_${req.params.type}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSummary,
  exportReport
};
