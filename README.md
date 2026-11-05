# OmniLock

### Intelligent Inventory & Order Management System

OmniLock is a full-stack inventory and order management application developed using **Next.js, TypeScript, PostgreSQL, and MongoDB**.

The system integrates inventory management, order processing, reservations, payments, fulfillment, shipments, and customer support. It demonstrates advanced database concepts, including transactions, stored functions, triggers, concurrency control, indexing, and NoSQL aggregation.

---

## Project Objectives

* Maintain accurate inventory records across warehouses.
* Prevent overselling through controlled stock reservations.
* Manage orders from reservation to delivery.
* Ensure database consistency and integrity.
* Integrate SQL and NoSQL databases within a single application.

## Key Features

**Dashboard**

* Inventory and order statistics
* Recent orders and low-stock alerts

**Inventory Management**

* Product, category, and warehouse management
* Physical, reserved, and available stock tracking
* Search and filtering
* Interactive Three.js warehouse visualization
* 3D Twin, Split View, and Data Grid modes

**Orders and Reservations**

* Order creation and tracking
* 15-minute inventory reservations
* Automatic reservation expiry during local development
* Order cancellation and inventory release

**Payments**

* Simulated payment confirmation
* Payment-status tracking
* Simulated refund handling

**Fulfillment and Shipments**

* Order preparation and packing
* Shipment creation and tracking
* Dispatch and delivery management
* Transactional inventory updates

**Customer Support**

* MongoDB-based support tickets
* Ticket creation, status updates, and messages
* Ticket analytics using MongoDB aggregation

**Authentication**

* User registration, login, and logout
* Secure password hashing and database-backed sessions
* Admin and Staff account roles in the database

---

## Technology Stack

| Component        | Technology                       |
| ---------------- | -------------------------------- |
| Frontend         | Next.js 16, React 19, TypeScript |
| Styling          | CSS Modules, Tailwind CSS        |
| 3D Visualization | Three.js                         |
| Backend          | Next.js API Route Handlers       |
| SQL Database     | PostgreSQL (Neon)                |
| NoSQL Database   | MongoDB Atlas                    |
| Version Control  | Git and GitHub                   |

---

## Database Design

OmniLock follows a **hybrid SQL and NoSQL architecture**.

### PostgreSQL

PostgreSQL handles structured data and transactional operations.

**Main entities:** Customer, Category, Product, Warehouse, Inventory, Orders, Order Items, Inventory Reservations, Payments, Refunds, Fulfillment, Shipments, Inventory Dispatch, Accounts, and Sessions.

### MongoDB

MongoDB manages customer support tickets and related information.

* **Database:** `omnilock_support`
* **Collection:** `tickets`

**Database selection:** PostgreSQL provides relational integrity, transactions, and concurrency control for inventory and order processing. MongoDB supports flexible document structures for customer support data.

---

## Advanced Database Concepts

| Concept             | Implementation                                               |
| ------------------- | ------------------------------------------------------------ |
| Transactions        | Cancellation, fulfillment, and dispatch                      |
| Stored Functions    | Reservation expiry, cancellation, and fulfillment operations |
| Triggers            | Reservation and inventory integrity                          |
| Indexing            | Unique and partial indexes                                   |
| Concurrency Control | Row-level locking and reservation validation                 |
| Constraints         | Primary keys, foreign keys, and CHECK constraints            |
| Complex Queries     | JOIN, GROUP BY, subqueries, and aggregates                   |
| NoSQL Aggregation   | MongoDB `$match`, `$group`, `$facet`, and `$sort`            |

---

## System Architecture

```text
                 OmniLock
                    |
             Next.js Frontend
                    |
          Next.js API Route Handlers
                    |
          +---------+---------+
          |                   |
     PostgreSQL           MongoDB Atlas
        (Neon)                 |
          |                    |
   Inventory & Orders     Support Tickets
          |
     Reservations
          |
       Payments
          |
      Fulfillment
          |
       Shipments
```

---

## Installation and Setup

### Prerequisites

* Node.js and npm
* Git
* PostgreSQL (Neon)
* MongoDB Atlas

### 1. Clone the Repository

```bash
git clone https://github.com/Sneha-Anand1910/Omnilock_DBMS_Miniproject.git
cd Omnilock_DBMS_Miniproject
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root.

```env
DATABASE_URL=your_postgresql_connection_string
MONGODB_URI=your_mongodb_connection_string
EXPIRY_API_SECRET=your_secure_random_secret
```

Do not commit database credentials or `.env.local` to GitHub.

### 4. Database Setup

Configure PostgreSQL with the required base schema and apply the relevant SQL migrations from the `migrations/` directory in dependency order.

The migrations cover cancellation, fulfillment, dispatch, authentication, and account roles. They require the existing base database schema.

Configure MongoDB Atlas using the database `omnilock_support` and collection `tickets`.

### 5. Run the Application

```bash
npm run dev
```

Open `http://localhost:3000`.

### 6. Production Build

```bash
npm run build
npm run start
```

**Note:** Automatic reservation expiry runs in local development. A separate scheduler is required for continuous production execution.

---

## Testing

Key test scenarios include:

* Product, customer, category, and warehouse CRUD operations
* Inventory reservation and stock validation
* Reservation expiry and stock release
* Payment confirmation and order cancellation
* Fulfillment, dispatch, and shipment delivery
* Concurrent reservation handling
* MongoDB support ticket operations and aggregation
* User registration, login, and logout

Concurrency test script: `scripts/concurrency-test.mjs`

---
## Conclusion

OmniLock demonstrates the integration of PostgreSQL and MongoDB in a full-stack inventory and order management application, emphasizing transactional integrity, concurrency control, advanced database operations, and database–application integration.
