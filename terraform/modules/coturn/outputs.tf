output "public_ip" {
  value       = aws_eip.coturn.public_ip
  description = "Static Public Elastic IP for Coturn STUN/TURN"
}

output "instance_id" {
  value       = aws_instance.coturn.id
  description = "Instance ID of Coturn"
}
