$(call inherit-product, $(SRC_TARGET_DIR)/product/aosp_x86_64.mk)

PRODUCT_NAME := movieroom_x86_64
PRODUCT_DEVICE := generic_x86_64
PRODUCT_BRAND := TaylorMade Movies
PRODUCT_MODEL := Movie Room OS Emulator
PRODUCT_MANUFACTURER := TaylorMade Movies

PRODUCT_SYSTEM_PROPERTIES += \
    ro.movieroom.product=MovieRoomOS \
    ro.movieroom.release=0.1.0-prototype

# The launcher module is supplied by the Movie Room AOSP integration step.
# Keeping this product file independent lets the base image build before the
# launcher module is imported into the AOSP checkout.
PRODUCT_COPY_FILES += \
    device/movieroom/emulator/overlay/frameworks/base/core/res/res/values/config.xml:$(TARGET_COPY_OUT_PRODUCT)/etc/movieroom/home-config.xml
