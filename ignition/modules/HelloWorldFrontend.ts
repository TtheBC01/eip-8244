import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("HelloWorldFrontendModule", (m) => {
  const frontend = m.contract("HelloWorldFrontend");
  return { frontend };
});
