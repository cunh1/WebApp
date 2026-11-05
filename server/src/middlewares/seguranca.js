export function cabecalhosSeguros(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function semCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
