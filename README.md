# weather-x402

Микросервис на Node.js, продающий данные о погоде ботам за USDC-микроплатежи по протоколу [x402](https://x402.org).

## Как это работает

1. Клиент делает `GET /api/weather?city=Moscow`.
2. Если заголовок оплаты отсутствует — сервер отвечает **HTTP 402** с требованиями платежа.
3. Клиент подписывает EIP-3009 transfer на 0.001 USDC и повторяет запрос с заголовком `X-PAYMENT`.
4. Middleware верифицирует платёж через фасилитатор и расплачивается on-chain.
5. Клиент получает JSON с данными о погоде.

---

## Требования

- Node.js ≥ 18
- Аккаунт [OpenWeatherMap](https://openweathermap.org/api) (бесплатный тариф достаточен)
- EVM-кошелёк для получения USDC (например MetaMask)

---

## Установка

```bash
git clone <your-repo-url>
cd weather-x402
npm install
```

---

## Настройка `.env`

Скопируй пример и заполни значения:

```bash
cp .env.example .env
```

Отредактируй `.env`:

```env
WEATHER_API_KEY=ваш_ключ_openweathermap
PAY_TO_ADDRESS=0xВашАдресКошелька
PORT=3000
FACILITATOR_URL=https://x402.org/facilitator
NETWORK=eip155:8453
```

| Переменная       | Описание                                                                 |
|------------------|--------------------------------------------------------------------------|
| `WEATHER_API_KEY`| API-ключ OpenWeatherMap                                                  |
| `PAY_TO_ADDRESS` | Ваш EVM-адрес для получения USDC                                         |
| `PORT`           | Порт сервера (по умолчанию 3000)                                         |
| `FACILITATOR_URL`| URL фасилитатора x402 (публичный: `https://x402.org/facilitator`)        |
| `NETWORK`        | `eip155:8453` (Base Mainnet) или `eip155:84532` (Base Sepolia — тестнет) |

> **Тестирование без реальных денег:** замените `NETWORK=eip155:84532`. На Base Sepolia USDC можно получить в faucet: https://faucet.circle.com

---

## Локальный запуск

```bash
# Продакшн
npm start

# Режим разработки (auto-reload)
npm run dev
```

Вывод при старте:

```
🌤  weather-x402 запущен на порту 3000
   Сеть:        eip155:8453
   Цена:        0.001 USDC (1000 atomic units)
   ...
```

---

## Эндпоинты

### `GET /health`
Проверка работоспособности. Не требует оплаты.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "service": "weather-x402",
  "time": "2026-03-31T12:00:00.000Z",
  "network": "eip155:8453",
  "payTo": "0x..."
}
```

---

### `GET /.well-known/x402`
Метаданные сервиса для x402 Discovery. Не требует оплаты.

```bash
curl http://localhost:3000/.well-known/x402
```

```json
{
  "version": "1",
  "service": "weather-x402",
  "endpoints": [
    {
      "path": "/api/weather",
      "payment": {
        "scheme": "exact",
        "network": "eip155:8453",
        "amount": "1000 (0.001 USDC)"
      }
    }
  ]
}
```

---

### `GET /api/weather?city=<название>`
Данные о погоде. **Требует оплаты 0.001 USDC.**

```bash
# Без оплаты — вернёт 402
curl http://localhost:3000/api/weather?city=Moscow

# С оплатой (x402-совместимый клиент подставит заголовок автоматически)
curl -H "X-PAYMENT: <signed-payment-header>" \
     http://localhost:3000/api/weather?city=Moscow
```

Ответ (200):

```json
{
  "city": "Moscow",
  "country": "RU",
  "temperature": 5.2,
  "feels_like": 2.1,
  "humidity": 78,
  "pressure": 1013,
  "wind_speed": 4.5,
  "description": "пасмурно",
  "icon": "04d",
  "timestamp": "2026-03-31T12:00:00.000Z",
  "cached": false
}
```

---

## Деплой на Render.com

1. Создай новый **Web Service** → подключи репозиторий.
2. Настройки:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
3. В разделе **Environment Variables** добавь все переменные из `.env`:
   - `WEATHER_API_KEY`
   - `PAY_TO_ADDRESS`
   - `FACILITATOR_URL`
   - `NETWORK`
4. (Опционально) в **Advanced** → **Health Check Path** укажи `/health`.
5. Нажми **Deploy**. Render автоматически выдаст публичный URL вида `https://weather-x402.onrender.com`.

> **Важно:** После деплоя убедись, что `PORT` не задан вручную — Render сам передаёт `PORT` через переменную окружения.

---

## Регистрация в x402 Discovery

После деплоя зарегистрируй сервис, чтобы боты могли его найти автоматически.

### Проверка метаданных

```bash
curl https://weather-x402.onrender.com/.well-known/x402
```

### Регистрация (пример curl)

```bash
curl -X POST https://x402.org/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://weather-x402.onrender.com",
    "metadataUrl": "https://weather-x402.onrender.com/.well-known/x402"
  }'
```

> Конкретный URL регистрации уточняй в [документации x402](https://x402.org/docs) — API Discovery может меняться.

---

## Кэширование

Данные о погоде кэшируются в памяти на **30 минут**. Поле `"cached": true` в ответе означает, что данные взяты из кэша. Это снижает количество обращений к OpenWeatherMap API и платежей за повторные запросы одного города не требует (клиент платит один раз, затем в течение 30 минут получает кэшированные данные бесплатно для повторных запросов — при условии, что запрашивает тот же сервер).

---

## Структура проекта

```
weather-x402/
├── server.js        # Основной сервер
├── package.json
├── .env.example     # Шаблон переменных окружения
├── .gitignore
└── README.md
```
