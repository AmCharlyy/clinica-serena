using System.Security.Cryptography;
using System.Text;

namespace ClinicaDeploy;

// Streaming encrypt-then-MAC. Distinct random AES/HMAC keys, RSA-OAEP wrapping.
// Authenticate the complete envelope BEFORE producing any plaintext on restore.
public static class BackupCipher
{
    static readonly byte[] Magic = Encoding.ASCII.GetBytes("SERENA01");
    public static void Encrypt(string input, string output, RSA recipient)
    {
        var keys = RandomNumberGenerator.GetBytes(64); var iv = RandomNumberGenerator.GetBytes(16);
        try
        {
            var wrapped = recipient.Encrypt(keys, RSAEncryptionPadding.OaepSHA256);
            using (var file = new FileStream(output, FileMode.CreateNew, FileAccess.Write))
            using (var writer = new BinaryWriter(file, Encoding.UTF8, true))
            {
                writer.Write(Magic); writer.Write(wrapped.Length); writer.Write(wrapped); writer.Write(iv);
                using var aes = Aes.Create(); aes.Key = keys[..32]; aes.IV = iv;
                using var crypto = new CryptoStream(file, aes.CreateEncryptor(), CryptoStreamMode.Write, true);
                using var source = File.OpenRead(input); source.CopyTo(crypto); crypto.FlushFinalBlock();
            }
            using var hmac = new HMACSHA256(keys[32..]);
            byte[] tag; using (var source = File.OpenRead(output)) tag = hmac.ComputeHash(source);
            using var append = new FileStream(output, FileMode.Append); append.Write(tag);
        }
        finally { CryptographicOperations.ZeroMemory(keys); }
    }
    public static void Decrypt(string input, string output, RSA recipient)
    {
        using var file = File.OpenRead(input); using var reader = new BinaryReader(file, Encoding.UTF8, true);
        if (!reader.ReadBytes(8).SequenceEqual(Magic)) throw new InvalidDataException("No es un respaldo Serena compatible.");
        var length = reader.ReadInt32(); if (length < 256 || length > 1024 || file.Length < length + 76) throw new InvalidDataException("Cabecera inválida.");
        var keys = recipient.Decrypt(reader.ReadBytes(length), RSAEncryptionPadding.OaepSHA256);
        if (keys.Length != 64) throw new CryptographicException("Clave inválida.");
        try
        {
            var iv = reader.ReadBytes(16); var offset = file.Position; var authenticatedLength = file.Length - 32;
            using var hmac = new HMACSHA256(keys[32..]); file.Position = 0;
            var buffer = new byte[128 * 1024]; long remaining = authenticatedLength;
            while (remaining > 0) { var read = file.Read(buffer, 0, (int)Math.Min(remaining, buffer.Length)); if (read == 0) throw new EndOfStreamException(); hmac.TransformBlock(buffer, 0, read, null, 0); remaining -= read; }
            hmac.TransformFinalBlock([], 0, 0);
            if (!CryptographicOperations.FixedTimeEquals(hmac.Hash!, reader.ReadBytes(32))) throw new CryptographicException("Respaldo alterado o incompleto. No se produjo contenido descifrado.");
            file.Position = offset;
            using var aes = Aes.Create(); aes.Key = keys[..32]; aes.IV = iv;
            using var outputFile = new FileStream(output, FileMode.CreateNew);
            using var crypto = new CryptoStream(outputFile, aes.CreateDecryptor(), CryptoStreamMode.Write);
            remaining = authenticatedLength - offset;
            while (remaining > 0) { var read = file.Read(buffer, 0, (int)Math.Min(remaining, buffer.Length)); if (read == 0) throw new EndOfStreamException(); crypto.Write(buffer, 0, read); remaining -= read; }
            crypto.FlushFinalBlock();
        }
        finally { CryptographicOperations.ZeroMemory(keys); }
    }
}
