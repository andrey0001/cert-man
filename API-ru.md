# Документация CertManager API

Этот документ описывает, как взаимодействовать напрямую с API бэкенда CertManager.

## Базовый URL
По умолчанию бэкенд работает на порту `3001`.
**Base URL:** `http://localhost:3001`

## Аутентификация

Чтобы обойти систему входа JWT и выполнять действия через скрипты напрямую, необходимо использовать API-ключ.
По умолчанию API-ключ настроен в `docker-compose.yml` как `API_KEY=my-secret-api-key`.

Вы должны включать этот ключ в заголовки каждого запроса (кроме `/api/status` и `/api/login`):
**Заголовок:** `X-API-Key: my-secret-api-key`

---

## Обзор эндпоинтов

### 1. Проверить статус API
Проверить, запущен ли API. (Аутентификация не требуется)
```bash
curl http://localhost:3001/api/status
```

### 2. Список сертификатов
Получить постраничный список всех сертификатов.
- **Параметры запроса:** `page` (по умолчанию: 1), `limit` (по умолчанию: 0 = все), `type` (опционально: 'ca', 'server', 'client')

```bash
curl -H "X-API-Key: my-secret-api-key" \
     "http://localhost:3001/api/certs?limit=10&page=1"
```

### 3. Получить детали сертификата
Получить подробную информацию о конкретном сертификате, включая строку PEM.
```bash
curl -H "X-API-Key: my-secret-api-key" \
     http://localhost:3001/api/certs/<SERIAL_NUMBER>
```

### 4. Создать Центр Сертификации (CA)
Создать новый корневой (Root) или промежуточный (Intermediate) CA.
- Чтобы создать корневой CA, не указывайте `parentCaSerial`.
- Чтобы создать промежуточный CA, укажите `parentCaSerial` подписывающего корневого CA.

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "X-API-Key: my-secret-api-key" \
     -d '{
           "commonName": "My Automation Root CA",
           "organization": "My Company",
           "country": "US",
           "validityDays": 3650,
           "keySize": 4096
         }' \
     http://localhost:3001/api/ca
```

### 5. Создать серверный или клиентский сертификат
Сгенерировать новый сертификат, подписанный существующим CA.
- **Обязательно:** `caSerial` (серийный номер CA, который подпишет этот сертификат), `commonName`.
- **Опционально:** `isClient` (boolean, установите true для клиентских сертификатов mTLS), `sans` (массив строк для Subject Alternative Names, таких как IP и домены).

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "X-API-Key: my-secret-api-key" \
     -d '{
           "caSerial": "<CA_SERIAL_NUMBER>",
           "commonName": "api.example.com",
           "isClient": false,
           "validityDays": 365,
           "sans": ["api.example.com", "10.0.0.5"]
         }' \
     http://localhost:3001/api/certs
```

### 6. Скачать файлы сертификата
Скачать файлы `.crt`, `.key` или `.p12`.

#### Скачать CRT или ключ (GET)
```bash
# Скачать CRT
curl -H "X-API-Key: my-secret-api-key" \
     -o certificate.crt \
     http://localhost:3001/api/download/<SERIAL_NUMBER>/crt

# Скачать приватный ключ
curl -H "X-API-Key: my-secret-api-key" \
     -o private.key \
     http://localhost:3001/api/download/<SERIAL_NUMBER>/key
```

#### Скачать архив P12 (POST)
Чтобы скачать архив PKCS#12, вы должны предоставить пароль для шифрования в теле запроса.
```bash
# Скачать P12
curl -X POST -H "Content-Type: application/json" \
     -H "X-API-Key: my-secret-api-key" \
     -d '{"password": "my_secure_password", "algorithm": "aes256"}' \
     -o bundle.p12 \
     http://localhost:3001/api/download/<SERIAL_NUMBER>/p12
```

Примечание: `algorithm` может быть `aes256` (по умолчанию) или `3des` (устаревший).

### 7. Отозвать сертификат
Помечает сертификат как отозванный в базе данных.

```bash
curl -X POST -H "X-API-Key: my-secret-api-key" \
     http://localhost:3001/api/certs/<SERIAL_NUMBER>/revoke
```

### 8. Удалить сертификат
Навсегда удаляет сертификат, его ключи и запись из индекса. **Это действие нельзя отменить.**

```bash
curl -X DELETE -H "X-API-Key: my-secret-api-key" \
     http://localhost:3001/api/certs/<SERIAL_NUMBER>
```

### 9. Скачать список отзыва сертификатов (CRL)
Получить актуальный CRL для определенного Центра Сертификации. (Аутентификация не требуется, так как списки отзыва публичны, чтобы любые клиенты могли проверять статус сертификатов).

```bash
curl -o revoked.crl http://localhost:3001/api/ca/<СЕРИЙНЫЙ_НОМЕР_CA>/crl
```
