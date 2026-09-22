data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

# Static Elastic IP for NAT traversal stability
resource "aws_eip" "coturn" {
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-${var.environment}-coturn-eip"
    Environment = var.environment
  }
}

resource "aws_instance" "coturn" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [var.security_group_id]

  user_data = <<-EOF
              #!/bin/bash
              apt-get update -y
              apt-get install -y coturn

              systemctl stop coturn

              cat <<EOC > /etc/turnserver.conf
              listening-port=3478
              tls-listening-port=5349
              min-port=49152
              max-port=49200
              fingerprint
              lt-cred-mech
              user=${var.turn_username}:${var.turn_password}
              realm=${var.realm}
              log-file=/var/log/turnserver.log
              verbose
              no-multicast-peers
              EOC

              sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/g' /etc/default/coturn
              systemctl restart coturn
              systemctl enable coturn
              EOF

  tags = {
    Name        = "${var.project_name}-${var.environment}-coturn"
    Environment = var.environment
    Role        = "stun-turn"
  }
}

resource "aws_eip_association" "coturn" {
  instance_id   = aws_instance.coturn.id
  allocation_id = aws_eip.coturn.id
}
