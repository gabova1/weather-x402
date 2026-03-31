import 'dotenv/config';
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Кэш
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(city) {
  const entry = cache.get(city.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(city.toLowerCase());
    return null;
  }
  return entry.data;
}
function setCache(city, data) {
  cache.set(city.toLowerCase(), { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Получение погоды
async function fetchWeather(city) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${process.env.WEATHER_API_KEY}&units=metric&lang=ru`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw { status: 401, message: 'Неверный API ключ' };
    if (res.status === 404) throw { status: 404, message: 'Город не найден' };
    throw { status: 502, message: `Ошибка OpenWeatherMap: ${res.status}` };
  }
  const data = await res.json();
  return {
    city: data.name,
    country: data.sys.country,
    temperature: data.main.temp,
    feels_like: data.main.feels_like,
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    wind_speed: data.wind.speed,
    description: data.weather[0]?.description,
    icon: data.weather[0]?.icon,
    timestamp: new Date().toISOString(),
  };
}

// Функция проверки оплаты (упрощённая)
function isPaymentProvided(req) {
  // Проверяем наличие заголовков x402-payment или x-payment
  const paymentProof = req.headers['x402-payment'] || req.headers['x-payment'];
  if (!paymentProof) return false;
  // Здесь должна быть полноценная проверка на блокчейне, но для начала просто считаем, что любой заголовок подходит
  // В будущем можно добавить проверку, вызвав фасилитатор.
  return true;
}

// Middleware для проверки оплаты
function requirePayment(req, res, next) {
  // Пропускаем открытые эндпоинты
  if (req.path === '/health' || req.path === '/.well-known/x402') {
    return next();
  }
  // Для защищённого эндпоинта проверяем оплату
  if (req.path === '/api/weather') {
    if (!isPaymentProvided(req)) {
      // Отвечаем 402 с инструкцией
      res.setHeader('X-Payment-Required', 'true');
      res.setHeader('X-Payment-Address', process.env.PAY_TO_ADDRESS);
      res.setHeader('X-Payment-Amount', '0.001');
      res.setHeader('X-Payment-Network', 'base-mainnet');
      res.status(402).json({
        error: 'payment_required',
        message: 'Please pay 0.001 USDC to continue',
        payTo: process.env.PAY_TO_ADDRESS,
        amount: '0.001 USDC',
        network: 'base-mainnet',
        instruction: 'Include payment proof in X-402-Payment header after completing payment'
      });
      return;
    }
  }
  next();
}

app.use(express.json());
app.use(requirePayment);

// Защищённый эндпоинт
app.get('/api/weather', async (req, res) => {
  const city = req.query.city?.trim();
  if (!city) return res.status(400).json({ error: 'city required' });

  const cached = getCached(city);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const data = await fetchWeather(city);
    setCache(city, data);
    res.json({ ...data, cached: false });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

// Открытые эндпоинты
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'weather-x402', time: new Date().toISOString() });
});

app.get('/.well-known/x402', (req, res) => {
  res.json({
    name: 'Weather API',
    description: 'Real-time weather data, 0.001 USDC per request',
    endpoints: [{ path: '/api/weather', price: '0.001 USDC' }],
    payment: {
      address: process.env.PAY_TO_ADDRESS,
      amount: '0.001',
      network: 'base-mainnet',
    },
  });
});

app.listen(port, () => {
  console.log(`✅ Сервер запущен на порту ${port}`);
  console.log(`💰 Защищён: /api/weather (0.001 USDC)`);
  console.log(`💳 Кошелёк: ${process.env.PAY_TO_ADDRESS}`);
});