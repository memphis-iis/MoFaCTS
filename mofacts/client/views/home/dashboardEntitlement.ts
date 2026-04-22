type DashboardEntitlementInput = {
  isPublishedByServer: boolean;
};

function passesDashboardEntitlement(input: DashboardEntitlementInput) {
  return input.isPublishedByServer === true;
}

export {
  passesDashboardEntitlement,
};
