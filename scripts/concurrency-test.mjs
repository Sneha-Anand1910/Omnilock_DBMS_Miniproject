const API_URL = "http://localhost:3000/api/reservations";

async function placeOrder(channel) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerId: 1,
        productId: 5,
        warehouseId: 1,
        quantity: 1,
        channel,
      }),
    });

    const data = await response.json();

    return {
      channel,
      httpStatus: response.status,
      ...data,
    };
  } catch (error) {
    return {
      channel,
      success: false,
      message: error.message,
    };
  }
}

async function runConcurrencyTest() {
  console.log("===================================");
  console.log("OMNILOCK CONCURRENCY TEST");
  console.log("===================================");
  console.log("Sending two simultaneous orders...\n");

  const results = await Promise.all([
    placeOrder("WEBSITE"),
    placeOrder("MOBILE"),
  ]);

  results.forEach((result, index) => {
    console.log(`Request ${index + 1}:`, result);
  });

  const successfulOrders = results.filter(
    (result) => result.success === true
  ).length;

  const failedOrders = results.filter(
    (result) => result.success === false
  ).length;

  console.log("\n===================================");
  console.log("TEST SUMMARY");
  console.log("===================================");
  console.log("Successful orders:", successfulOrders);
  console.log("Failed orders:", failedOrders);

  if (successfulOrders === 1 && failedOrders === 1) {
    console.log("PASS: Overselling prevented!");
  } else {
    console.log("CHECK: Unexpected result. Review inventory.");
  }
}

runConcurrencyTest();