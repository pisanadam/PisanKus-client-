package net.kdt.pojavlaunch.modloaders.pisan;

/**
 * The launcher's own pack, as a list of Modrinth slugs.
 *
 * This is the same pack the desktop launcher installs — {@code src/shared/curatedPack.ts}
 * holds the list there, and the two are meant to stay in step, so a player who
 * moves between phone and desktop gets the same profile on both. Editing one
 * without the other is how they drift apart.
 *
 * Neither side ships a .mrpack. The pack is a list of slugs resolved against
 * Modrinth at install time, which is the whole point: mods do not move in step,
 * some follow Minecraft within days and others sit on an old version for a
 * year. A frozen list would install a broken profile the day one of them fell
 * behind, so the installer takes whichever entries have a build for the chosen
 * version and reports the rest instead of failing.
 *
 * A pack installs mods and nothing else. It does not write options.txt and does
 * not touch the profile's memory or renderer settings — those stay wherever the
 * player put them.
 */
public final class PisanPack {
    public static final String NAME = "Pisan Optimized";

    /**
     * Modrinth loader facet the pack resolves against, and the loader the
     * created profile runs.
     */
    public static final String LOADER = "fabric";

    /**
     * Versions worth defaulting to, newest first. Others stay selectable — this
     * only decides where the spinner lands when the screen opens.
     */
    public static final String[] RECOMMENDED_VERSIONS = {"26.2", "1.21.11", "1.21.1"};

    /** One entry of the pack. */
    public static final class Mod {
        /** Modrinth slug — stable, and readable in the code. */
        public final String slug;
        public final String name;
        /** Shown while installing, so the player sees what each piece is for. */
        public final String role;
        /**
         * A pack without this mod is not worth installing. Missing an essential
         * entry aborts the install; missing an optional one is just reported.
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
     * Ordered by what depends on what, then by how much each one matters — which
     * is also the order they install in.
     *
     * Libraries come first on purpose. Every one of them is a required
     * dependency of something further down, and installing them up front means
     * the dependency resolver finds them already present instead of fetching
     * them a second time.
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
            mod("dynamic-fps", "Dynamic FPS", "Pencere arkadayken güç harcamaz"),
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

    private PisanPack() {}
}
