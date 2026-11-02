package co.edu.uts.cam;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Contraseñas con PBKDF2-HMAC-SHA256 (incluido en Java): sal aleatoria de 16 bytes por usuario,
 * 310 000 iteraciones y comparación en tiempo constante (RNF-SEG-01).
 * Formato guardado: pbkdf2_sha256$iteraciones$sal$hash (base64).
 */
public final class Passwords {

    public static final int MIN = 4;
    public static final int MAX = 128;
    private static final int ITER = 310_000;
    private static final SecureRandom RANDOM = new SecureRandom();
    /** Hash ficticio para que un usuario inexistente tarde lo mismo que uno real. */
    public static final String DUMMY = hash("cuenta-inexistente");

    private Passwords() { }

    public static String hash(String password) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[] key = derive(password, salt, ITER, 32);
        Base64.Encoder b = Base64.getEncoder();
        return "pbkdf2_sha256$" + ITER + "$" + b.encodeToString(salt) + "$" + b.encodeToString(key);
    }

    public static boolean verify(String password, String stored) {
        String[] p = stored == null ? new String[0] : stored.split("\\$");
        if (p.length != 4 || !p[0].equals("pbkdf2_sha256")) return false;
        Base64.Decoder b = Base64.getDecoder();
        byte[] expected = b.decode(p[3]);
        byte[] key = derive(password, b.decode(p[2]), Integer.parseInt(p[1]), expected.length);
        return MessageDigest.isEqual(key, expected);
    }

    private static byte[] derive(String password, byte[] salt, int iter, int bytes) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iter, bytes * 8);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
