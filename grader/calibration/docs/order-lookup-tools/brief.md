# Brief: tool definitions for an order-lookup MCP server

Get the model to write the JSON list of tool definitions (`name`, `description`, `inputSchema`) for a support assistant's order-lookup server. Three tools:

- `get_order`: one order by ID (IDs look like `ORD-10293`); returns status, items, totals and address. Parameter `order_id` (string, required).
- `search_orders`: a customer's orders by email, newest first, at most 50. Parameters `customer_email` (string, required), `status` (string, optional), `limit` (integer, optional).
- `track_shipment`: carrier, tracking number and latest event for a shipped order. Parameter `order_id` (string, required).

Every tool and parameter needs a description a model can act on. Output only the JSON. Under about 250 words of description in total.
