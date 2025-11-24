# Nika Referral System

A commission-based referral system for the Nika trading platform with a Vue.js frontend and NestJS backend.

## Quick Start with Docker (Recommended)

The easiest way to run the project is with Docker. No need to install Node.js or MongoDB manually.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (20.x or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.x or higher)

### Run with Docker

```bash
# Clone the repository
git clone https://github.com/QChab/nika
cd nika

# Build and start all services
docker compose up --build

# Run in detached mode
docker compose up --build -d
```

That's it! The application will be available at:

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:8080 |
| **Backend API** | http://localhost:3001/api |
| **Swagger Docs** | http://localhost:3001/docs |

## Manual Installation (Alternative)

If you prefer to run without Docker, follow these instructions.

### System Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 18.x or higher | Required for both backend and frontend |
| **npm** | 9.x or higher | Comes with Node.js |
| **MongoDB** | 6.x or higher | Local instance or remote connection |

### Requirements

- Node.js
- MongoDB

### Installation

#### 1. Clone the repository

```bash
git clone <repository-url>
cd nika
```

#### 2. Backend Setup

```bash
# Install dependencies
npm install
```

#### 3. Frontend Setup

```bash
cd frontend
npm install
cd ..
```

### Running the Application

#### Start MongoDB

Make sure MongoDB is running before starting the backend:

```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongodb
```

#### Start Backend

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

Backend runs on `http://localhost:3001`

#### Start Frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

## Running Tests

```bash
# Run all tests (unit + e2e)
npm run test
```

## Project Structure

```
nika/
- src/                    # Backend source code
- src/common/             # Shared constants, types
- src/referral/           # Referral module (users, commissions, network)
- src/trade/              # Trade module (webhook, fee distribution)
- test/                   # E2E tests
─ frontend/               # Vue.js frontend
─ frontend/src/
- frontend/src/components/     # Vue components
- frontend/src/App.vue         # Main application
- docker-compose.yml      # Docker Compose configuration
- Dockerfile              # Backend Dockerfile
- .env.example            # Environment template
- package.json
```

## Commission Structure

The system implements a 3-level cascade commission on trading fees:

| Level | Relationship | Commission Rate |
|-------|--------------|-----------------|
| Level 1 | Direct Referral | 30% of fee |
| Level 2 | Referral of Referral | 3% of fee |
| Level 3 | 3rd Degree | 2% of fee |

### Fee Distribution

For each trade, the total fee (1% for BASE tier, 0.5% for REDUCED tier) is distributed as:

| Recipient | Percentage | Description |
|-----------|------------|-------------|
| Cashback | 10% | Returned to trader |
| Treasury | 55% | Platform revenue |
| Commissions | 35% | Distributed to referral chain |

### Fee Token

Fees are taken in the token being traded (tokenIn). For example, if trading BTC, fees and commissions are in BTC.

## API Endpoints

### Referral

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/referral/users` | List all users |
| POST | `/api/referral/generate` | Create new user with referral code |
| POST | `/api/referral/register` | Register with existing referral code |
| GET | `/api/referral/network` | Get user's referral network (header: x-user-id) |
| GET | `/api/referral/earnings` | Get earnings breakdown (header: x-user-id, optional: startDate, endDate) |
| GET | `/api/referral/claimable` | Get claimable amounts (header: x-user-id) |
| POST | `/api/referral/claim` | Initiate claim (header: x-user-id) |

### Trade

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhook/trades` | List all trades |
| POST | `/api/webhook/trade` | Process a trade and distribute commissions |

### Trade Request Body

```json
{
  "userId": "ObjectId",
  "volume": "1000",
  "token": "BTC",
  "side": "BUY",
  "chain": "ARBITRUM"
}
```