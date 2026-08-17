package net.kdt.pojavlaunch.modloaders.pisan;

/**
 * The launcher's own pack, kept in step with src/shared/curatedPack.ts on the desktop.
 *
 * This is neither a Modrinth project nor an .mrpack. It is a list this launcher curates,
 * resolved against Modrinth at install time, so a pack written today still installs on a
 * Minecraft version that did not exist when it was written.
 *
 * That resolution is the whole point. Mods do not move in step: some follow Minecraft
 * within days, others sit on an old version for a year. A frozen list would install a
 * broken profile the day one of them fell behind, so the installer takes whichever
 * entries have a build for the chosen version and reports the rest instead of failing.
 *
 * A pack installs mods and nothing else. It does not write options.txt and does not touch
 * the profile's memory or JVM arguments — those stay wherever the player put them.
 */
public final class PisanPack {
    private PisanPack() {}

    public static final String NAME = "Pisan Optimized";

    /** Loader facet asked of Modrinth, and the loader the profile is created with. */
    public static final String LOADER = "fabric";

    /** Folder under custom_instances/, suffixed with the Minecraft version. */
    public static final String INSTANCE_PREFIX = "pisan-optimized";

    public static final class Mod {
        /** Modrinth slug — stable, and readable in the code. */
        public final String slug;
        public final String name;
        /** Shown while installing, so the player sees what each piece is for. */
        public final String role;
        /**
         * A pack without this mod is not worth installing. Missing an essential entry
         * aborts the install; missing an optional one is just reported.
         */
        public final boolean essential;

        private Mod(String slug, String name, String role, boolean essential) {
            this.slug = slug;
            this.name = name;
            this.role = role;
            this.essential = essential;
        }
    }

    private static Mod mod(String slug, String name, String role) {
        return new Mod(slug, name, role, false);
    }

    private static Mod essential(String slug, String name, String role) {
        return new Mod(slug, name, role, true);
    }

    /**
     * Ordered by what depends on what, then by how much each one matters — which is also
     * the order they resolve in.
     *
     * Libraries come first on purpose. Every one of them is a required dependency of
     * something further down, and resolving them up front means the dependency pass finds
     * them already queued instead of fetching them a second time.
     */
    public static final Mod[] MODS = {
            essential("fabric-api", "Fabric API", "Diğer modların dayandığı temel"),
            mod("fabric-language-kotlin", "Fabric Language Kotlin", "Kotlin ile yazılmış modların çalışma ortamı"),
            mod("cloth-config", "Cloth Config", "Ayar ekranı kütüphanesi"),
            mod("yacl", "YetAnotherConfigLib", "Ayar ekranı kütüphanesi"),
            mod("placeholder-api", "Placeholder API", "Metin yer tutucu kütüphanesi"),

            essential("sodium", "Sodium", "Render motorunu baştan yazar — en büyük FPS kazancı"),
            mod("lithium", "Lithium", "Oyun mantığını hızlandırır, davranışı değiştirmeden"),
            mod("ferrite-core", "FerriteCore", "Bellek kullanımını ciddi ölçüde düşürür"),
            mod("immediatelyfast", "ImmediatelyFast", "Arayüz ve HUD çizimini toplu hale getirir"),
            mod("entityculling", "Entity Culling", "Görünmeyen varlıkları hiç çizmez"),
            mod("moreculling", "More Culling", "Görünmeyen blok yüzeylerini eler"),
            mod("sodium-extra", "Sodium Extra", "Sodium’a ek görsel/performans ayarları"),
            mod("krypton", "Krypton", "Ağ katmanını hafifletir — sunucularda gecikme"),
            mod("c2me-fabric", "C2ME", "Chunk yüklemeyi çok çekirdeğe yayar"),
            mod("vmp-fabric", "Very Many Players", "Kalabalık sunucularda kare hızını korur"),
            mod("scalablelux", "ScalableLux", "Işık hesabını ayrı çekirdeklere taşır"),
            mod("threadtweak", "ThreadTweak", "İş parçacığı önceliklerini düzenler"),
            mod("dynamic-fps", "Dynamic FPS", "Oyun arkadayken güç harcamaz"),
            mod("fastquit", "FastQuit", "Dünyadan çıkışı bekletmez"),
            mod("modernfix", "ModernFix", "Açılışı kısaltır, bellek sızıntılarını kapatır"),
            mod("noisium", "Noisium", "Dünya üretimini hızlandırır"),
            mod("bobby", "Bobby", "Sunucunun izin verdiğinden uzağı görmenizi sağlar"),

            mod("modmenu", "Mod Menu", "Kurulu modları ve ayarlarını oyun içinden yönetir"),
            mod("reeses-sodium-options", "Reese’s Sodium Options", "Sodium ayar ekranını kullanışlı hale getirir"),
            mod("zoomify", "Zoomify", "Yakınlaştırma tuşu"),
            mod("appleskin", "AppleSkin", "Açlık ve doygunluk bilgisini gösterir"),
            mod("mouse-tweaks", "Mouse Tweaks", "Envanterde fare ile hızlı taşıma"),
            mod("3dskinlayers", "3D Skin Layers", "Skin’in üst katmanını üç boyutlu gösterir"),
            mod("no-chat-reports", "No Chat Reports", "Sohbet mesajlarının imzalanmasını kapatır"),
            mod("simple-voice-chat", "Simple Voice Chat", "Destekleyen sunucularda sesli konuşma"),
            mod("controlify", "Controlify", "Oyun kolu desteği")
    };
}
