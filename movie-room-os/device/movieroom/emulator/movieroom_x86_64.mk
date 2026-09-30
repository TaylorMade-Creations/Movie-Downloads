LOCAL_PATH := $(call my-dir)

$(call inherit-product, $(SRC_TARGET_DIR)/product/aosp_x86_64.mk)

PRODUCT_NAME := movieroom_x86_64
PRODUCT_DEVICE := generic_x86_64
PRODUCT_BRAND := TaylorMade Movies
PRODUCT_MODEL := Movie Room OS Emulator
PRODUCT_MANUFACTURER := TaylorMade Movies

PRODUCT_SYSTEM_PROPERTIES += \
    ro.movieroom.product=MovieRoomOS \
    ro.movieroom.release=0.1.0-prototype

# Keep the standard Android launcher in control. Movie Room is installed as an
# ordinary APK after the system image boots; it is not an AOSP HOME package.
