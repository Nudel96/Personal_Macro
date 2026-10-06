import { handleGatewayRequest } from "../server/gateway/index.mjs";

export default {
  fetch(request) {
    return handleGatewayRequest(request, "commands");
  },
};
