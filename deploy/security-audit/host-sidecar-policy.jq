# Root-owned classifier for the allowlisted all-container host-audit inventory.
# Acquisition owns the byte/time bound; this policy rejects extra input documents,
# invalid shapes, duplicate identities and inventories beyond 256 containers.
# It emits counts only, never container identifiers, labels or port-map contents.

def helper_service_names: ["playwright-mcp", "mongo-mcp"];
def helper_image_title: "mofacts-playwright-mcp";
def helper_ports: [8931, 8932];

def bounded_text($maximum):
  if type != "string" then false
  else length <= $maximum and all(explode[]; . >= 32 and . != 127)
  end;

def nullable_label:
  if . == null then true else bounded_text(256) end;

def valid_id:
  if type != "string" then false else test("^[a-f0-9]{64}$") end;

def valid_port_key:
  if type != "string" then false
  elif test("^[1-9][0-9]{0,4}/(tcp|udp|sctp)$") | not then false
  else (split("/")[0] | tonumber) <= 65535
  end;

# Docker's configured bindings can retain an empty/zero host port before a
# created container receives its dynamic allocation. Its container declaration
# remains independently classified; those valid shapes must not become an empty
# inventory or obscure a helper merely because it has not been started.
def valid_host_port:
  if type != "string" then false
  elif . == "" then true
  elif test("^(0|[1-9][0-9]{0,4})$") | not then false
  else tonumber <= 65535
  end;

def valid_binding:
  if type != "object" then false
  elif keys != ["HostIp", "HostPort"] then false
  else (.HostIp | bounded_text(64)) and (.HostPort | valid_host_port)
  end;

def valid_exposed_ports:
  if . == null then true
  elif type != "object" then false
  elif length > 256 then false
  else all(to_entries[];
    (.key | valid_port_key)
    and (.value | if type == "object" then length == 0 else false end))
  end;

def valid_bindings:
  if . == null then true
  elif type != "object" then false
  elif length > 256 then false
  else all(to_entries[];
    (.key | valid_port_key)
    and (.value |
      if . == null then true
      elif type != "array" then false
      elif length > 64 then false
      else all(.[]; valid_binding)
      end))
  end;

def valid_record:
  if type != "object" then false
  elif keys != ["bindings", "exposedPorts", "id", "imageTitle", "networkPorts", "service"] then false
  else (.id | valid_id)
    and (.service | nullable_label)
    and (.imageTitle | nullable_label)
    and (.exposedPorts | valid_exposed_ports)
    and (.bindings | valid_bindings)
    and (.networkPorts | valid_bindings)
  end;

def valid_inventory:
  if type != "array" then false
  elif length > 256 then false
  elif all(.[]; valid_record) | not then false
  else length == (map(.id) | unique | length)
  end;

def endpoint_number:
  . as $port | (helper_ports | index($port)) != null;

def endpoint_key:
  split("/")[0] | tonumber | endpoint_number;

def declared_endpoints:
  [(.exposedPorts, .bindings, .networkPorts)
    | select(. != null) | keys[] | select(endpoint_key)]
  | unique | length;

# Configured and active Docker mappings often repeat the same publication.
# Count an identical container-port/address/host-port tuple once per container.
def endpoint_publications:
  [(.bindings, .networkPorts) | select(. != null) | to_entries[]
    | .key as $port | (.value // [])[]
    | {port: $port, hostIp: .HostIp, hostPort: .HostPort}]
  | unique_by([.port, .hostIp, .hostPort])
  | map(select((.port | endpoint_key)
    or (.hostPort | if . == "" then false else tonumber | endpoint_number end)))
  | length;

def named_helper:
  . as $container
  | ((helper_service_names | index($container.service)) != null)
    or ($container.imageTitle == helper_image_title);

[., inputs] as $documents
| if ($documents | length) != 1 then error("invalid-sidecar-container-inventory")
  elif ($documents[0] | valid_inventory) | not then error("invalid-sidecar-container-inventory")
  else $documents[0]
    | map({named: named_helper, declarations: declared_endpoints, publications: endpoint_publications}) as $counts
    | {
        containerCount: ($counts | length),
        helperContainerCount: ($counts | map(select(.named or .declarations > 0 or .publications > 0)) | length),
        endpointDeclarationCount: ([$counts[].declarations] | add // 0),
        endpointPublicationCount: ([$counts[].publications] | add // 0)
      }
  end
