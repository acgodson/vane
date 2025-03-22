
// Example: Updating addAddressToAddressBook to pass userId
async function addAddressToAddressBook(userId, nickname, address) {
  try {
    // First get current address book
    const addressBook = await getAddressBook(userId);

    // Add new address
    addressBook[nickname] = address;

    // Save updated address book
    const params = {
      TableName: "AlexaWalletAddressBook",
      Item: {
        userId: userId,
        addresses: addressBook,
      },
    };

    await dynamoDB.put(params).promise();

    // Update the policy on Privy to allow transactions to this address
    // Pass the userId to updatePrivyPolicy
    await updatePrivyPolicy(address, userId);

    return true;
  } catch (error) {
    console.error("Error adding address to book:", error);
    return false;
  }
}

// Helper function to update Privy policy to allow transactions to an address
async function updatePrivyPolicy(newAddress, userId) {
  try {
    // Get secrets for Privy authentication
    const secrets = await getSecrets("PrivyWalletCredentials");
    const { policyId } = secrets;

    // First get the current policy
    const currentPolicy = await makePrivyRequest(
      `/policies/${policyId}`,
      "GET",
      null,
      userId
    );

    // Extract the existing rules
    const methodRules = currentPolicy.method_rules;

    // Find the eth_sendTransaction rule
    const sendTxRule = methodRules.find(
      (rule) => rule.method === "eth_sendTransaction"
    );

    if (sendTxRule) {
      // Add the new address to the rules
      const newRule = {
        name: `Allow ${newAddress}`,
        conditions: [
          {
            field_source: "ethereum_transaction",
            field: "to",
            operator: "eq",
            value: newAddress,
          },
        ],
        action: "ALLOW",
      };

      sendTxRule.rules.push(newRule);

      // Update the policy
      await makePrivyRequest(
        `/policies/${policyId}`,
        "PATCH",
        {
          method_rules: methodRules,
        },
        userId
      );
    }

    return true;
  } catch (error) {
    console.error("Error updating policy:", error);
    return false;
  }
}
