# Aurora VPN gateway fleet.
#
# One small instance per region, each with a static address, the WireGuard port
# open to the world and nothing else. The control plane is deliberately NOT
# described here: it holds the database and belongs in a separate state file
# with a separate blast radius.
#
# Usage:
#   terraform init
#   terraform apply -var="regions=[\"sgp1\",\"fra1\",\"nyc3\"]"

terraform {
  required_version = ">= 1.6"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.43"
    }
  }
}

variable "do_token" {
  type      = string
  sensitive = true
}

variable "git_repo" {
  type        = string
  description = "Pinned Git repository for gateway installation"
  default     = "https://github.com/aurora-vpn/aurora-vpn-platform.git"
}

variable "git_ref" {
  type        = string
  description = "Pinned Git tag or commit hash for gateway installation"
  default     = "v1.0.0"
}

variable "gateway_version" {
  type        = string
  description = "Gateway agent version string"
  default     = "1.0.0"
}

variable "regions" {
  type        = list(string)
  description = "Provider region slugs to place gateways in"
  default     = ["sgp1", "fra1", "nyc3"]
}

variable "instance_size" {
  type    = string
  default = "s-1vcpu-2gb"
}

variable "ssh_key_fingerprints" {
  type = list(string)
}

variable "control_plane_url" {
  type = string
}

variable "bootstrap_secret" {
  type      = string
  sensitive = true
}

variable "ssh_admin_cidrs" {
  type        = list(string)
  description = "Addresses allowed to SSH to gateways (bastion or VPN management)"
  default     = ["10.0.0.0/8"]
}

provider "digitalocean" {
  token = var.do_token
}

locals {
  gateway_subnets = { for index, region in var.regions : region => "10.20.${index + 1}.0/24" }
  gateway_subnets_v6 = { for index, region in var.regions : region => "fd00:20:${index + 1}::/64" }

  region_meta = {
    "sgp1" = { country = "Singapore", country_code = "SG", city = "Singapore" }
    "fra1" = { country = "Germany", country_code = "DE", city = "Frankfurt" }
    "nyc3" = { country = "United States", country_code = "US", city = "New York" }
    "lon1" = { country = "United Kingdom", country_code = "GB", city = "London" }
    "blr1" = { country = "India", country_code = "IN", city = "Bengaluru" }
    "tor1" = { country = "Canada", country_code = "CA", city = "Toronto" }
    "syd1" = { country = "Australia", country_code = "AU", city = "Sydney" }
  }
}

resource "digitalocean_droplet" "gateway" {
  for_each = toset(var.regions)

  name     = "aurora-gw-${each.value}"
  region   = each.value
  size     = var.instance_size
  image    = "ubuntu-24-04-x64"
  ssh_keys = var.ssh_key_fingerprints

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    gateway_id        = "aurora-gw-${each.value}"
    vpn_subnet        = local.gateway_subnets[each.value]
    vpn_subnet_v6     = local.gateway_subnets_v6[each.value]
    control_plane_url = var.control_plane_url
    bootstrap_secret  = var.bootstrap_secret
    git_repo          = var.git_repo
    git_ref           = var.git_ref
    gateway_version   = var.gateway_version
    country           = lookup(local.region_meta, each.value, { country = "Global", country_code = "GL", city = "Regional" }).country
    country_code      = lookup(local.region_meta, each.value, { country = "Global", country_code = "GL", city = "Regional" }).country_code
    city              = lookup(local.region_meta, each.value, { country = "Global", country_code = "GL", city = "Regional" }).city
    endpoint_host     = "gw-${each.value}.auroravpn.net"
    ssh_allow_cidr    = join(",", var.ssh_admin_cidrs)
  })

  tags = ["aurora", "gateway"]
}

resource "digitalocean_firewall" "gateway" {
  name        = "aurora-gateway"
  droplet_ids = [for d in digitalocean_droplet.gateway : d.id]

  inbound_rule {
    protocol         = "udp"
    port_range       = "51820"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_admin_cidrs
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

output "gateways" {
  value = {
    for region, droplet in digitalocean_droplet.gateway :
    region => {
      ipv4       = droplet.ipv4_address
      subnet_v4  = local.gateway_subnets[region]
      subnet_v6  = local.gateway_subnets_v6[region]
    }
  }
}
